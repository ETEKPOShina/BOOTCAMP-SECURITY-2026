import { useState } from 'react';
import { Send, FilePlus2, RefreshCw, WifiOff } from 'lucide-react';
import { useUser } from '../../auth/AuthContext';
import { useDb } from '../../data/store';
import { can } from '../../domain/permissions';
import { authorityLabel } from '../../domain/labels';
import { fmtDateTime } from '../../lib/dates';
import { useNetwork } from '../../lib/network';
import { manifestsOfTrip, userName } from '../../services/queries';
import { prepareJourneyUpdate, prepareProvisionalManifest, transmitManifest } from '../../services/api';
import { useAction } from '../../hooks/useAction';
import { useToast } from '../../components/Toast';
import { useAgencyTrip, TripNotFound } from './TripDetail';
import { ManifestTypeBadge, RecipientBadge, TripStatusBadge } from '../../components/status';
import { Dialog } from '../../components/Dialog';
import { Alert, Button, PageTitle, Panel, SimTag, TextAreaField } from '../../components/ui';

export function ManifestPage() {
  const trip = useAgencyTrip();
  const user = useUser();
  const db = useDb();
  const net = useNetwork();
  const { run, busy } = useAction();
  const toast = useToast();
  const [updateOpen, setUpdateOpen] = useState(false);
  const [note, setNote] = useState('');
  if (!trip) return <TripNotFound />;
  const manifests = manifestsOfTrip(db, trip.id).reverse();
  const canPrepare = can(user, 'agency.manifest.prepare');
  const canSend = can(user, 'agency.manifest.transmit');
  const anyReceived = manifests.some((m) => m.recipients.some((r) => ['received', 'verifying', 'processed'].includes(r.state)));
  const anyFailed = manifests.some((m) => m.recipients.some((r) => r.state === 'failed'));

  const send = async (id: string, only?: 'police_tg' | 'police_bj') => {
    const r = await run(`send-${id}-${only ?? 'all'}`, () => transmitManifest(user, id, only), (x) => (x.failed.length ? null : 'Transmission simulée effectuée. Accusés de réception attendus.'));
    if (r?.failed.length) toast(`Impossible de transmettre le manifeste pour le moment (${r.failed.map((a) => authorityLabel[a]).join(', ')}). Le contrôle classique reste disponible.`, 'error');
  };

  return (
    <>
      <PageTitle
        title="Transmission des manifestes"
        crumbs={[{ label: 'Voyages', to: '/agency/trips' }, { label: trip.reference, to: `/agency/trips/${trip.id}` }, { label: 'Manifestes' }]}
        lead={<>Voyage <span className="mono">{trip.reference}</span> — les accusés de réception et l'avancement du traitement sont communiqués à l'agence ; les résultats de vérification ne le sont pas.</>}
        badge={<TripStatusBadge s={trip.status} />}
        actions={
          <>
            {canPrepare && ['planned', 'preparing', 'boarding'].includes(trip.status) && <Button variant="secondary" icon={<FilePlus2 size={16} aria-hidden />} loading={busy === 'prov'} onClick={() => run('prov', () => prepareProvisionalManifest(user, trip.id), 'Manifeste provisoire préparé.')}>Préparer la liste provisoire</Button>}
            {canPrepare && ['boarding_closed', 'en_route', 'approaching_border'].includes(trip.status) && <Button icon={<RefreshCw size={16} aria-hidden />} onClick={() => setUpdateOpen(true)}>Préparer une mise à jour du voyage</Button>}
          </>
        }
      />
      <div className="stack" style={{ marginBottom: 16 }}>
        <Alert kind="info" title="Transmission simulée">Aucune connexion aux systèmes de la Police du Togo ou du Bénin n'est configurée. Les envois, accusés de réception et traitements sont simulés et identifiés comme tels.</Alert>
        {net.offline && <Alert kind="warning" title="Hors ligne"><WifiOff size={14} aria-hidden style={{ verticalAlign: -2 }} /> Impossible de transmettre le manifeste pour le moment. Les données seront synchronisées lorsque la connexion sera rétablie. Le contrôle classique reste disponible.</Alert>}
        {(anyFailed || (!anyReceived && ['boarding_closed', 'en_route', 'approaching_border', 'at_border'].includes(trip.status))) && (
          <Alert kind="warning" title="Le contrôle classique reste disponible.">Si aucun manifeste n'est reçu par un service, le bus reste éligible au contrôle classique au poste frontalier. Le départ n'est jamais bloqué par une erreur de transmission.</Alert>
        )}
      </div>
      {!manifests.length && <Panel><p className="muted">Aucun manifeste n'a encore été préparé. La liste provisoire est préparée lorsque le bus est complet ou à l'échéance configurée ({db.organizations.find((o) => o.id === trip.agencyId)?.provisionalDeadlineMinutes ?? 60} min avant le départ) ; la liste définitive à la clôture de l'embarquement.</p></Panel>}
      <div className="stack">
        {manifests.map((m, i) => {
          const sendable = m.recipients.some((r) => ['to_send', 'failed'].includes(r.state));
          return (
            <section key={m.id} className="panel" aria-label={`${m.reference}`} style={i === 0 ? { borderColor: 'var(--wz-violet-tint-strong)' } : undefined}>
              <div className="panel-head">
                <div className="stack-sm" style={{ gap: 4 }}>
                  <div className="row"><ManifestTypeBadge t={m.type} /><h2 className="mono" style={{ fontSize: 15 }}>{m.reference}</h2>{i === 0 && <span className="badge badge-violet">Version la plus récente</span>}</div>
                  <span className="small muted">Version {m.version} · préparée le {fmtDateTime(m.createdAt)} par {userName(db, m.createdBy)}</span>
                </div>
                {canSend && sendable && <Button variant="primary" icon={<Send size={16} aria-hidden />} loading={busy === `send-${m.id}-all`} onClick={() => send(m.id)}>Transmettre <SimTag>Simulation</SimTag></Button>}
              </div>
              <div className="panel-body stack">
                <dl className="dl">
                  <dt>Passagers transmis</dt><dd>{m.passengerCount}</dd>
                  <dt>Dossiers incomplets</dt><dd>{m.incompleteCount}{m.incompleteCount > 0 && <span className="small muted"> — à compléter avant la liste définitive</span>}</dd>
                  <dt>Contrôle classique</dt><dd>{m.conventionalCount} voyageur(s) non pré-inscrit(s), non transmis</dd>
                  {m.note && <><dt>Motif de la mise à jour</dt><dd>{m.note}</dd></>}
                </dl>
                <div className="table-wrap">
                  <table className="data">
                    <caption className="sr-only">États de transmission par destinataire</caption>
                    <thead><tr><th scope="col">Destinataire</th><th scope="col">Envoyé le</th><th scope="col">Accusé de réception</th><th scope="col">État de traitement</th><th scope="col"><span className="sr-only">Action</span></th></tr></thead>
                    <tbody>
                      {m.recipients.map((r) => (
                        <tr key={r.authority}>
                          <th scope="row" style={{ background: 'transparent', color: 'inherit', fontSize: 'inherit' }}>{authorityLabel[r.authority]}</th>
                          <td className="mono">{fmtDateTime(r.sentAt)}</td>
                          <td className="mono">{r.acknowledgedAt ? <>{fmtDateTime(r.acknowledgedAt)} <SimTag>simulé</SimTag></> : '—'}</td>
                          <td><RecipientBadge s={r.state} />{r.processedAt && <span className="small muted mono"> {fmtDateTime(r.processedAt)}</span>}</td>
                          <td>{canSend && r.state === 'failed' && <Button size="sm" icon={<RefreshCw size={14} aria-hidden />} loading={busy === `send-${m.id}-${r.authority}`} onClick={() => send(m.id, r.authority)}>Relancer</Button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          );
        })}
      </div>
      <Dialog open={updateOpen} title="Préparer une mise à jour du voyage" onClose={() => setUpdateOpen(false)} description="À utiliser lorsqu'un passager est ajouté ou retiré lors d'un arrêt autorisé. La nouvelle version reprend la liste des passagers embarqués."
        footer={<><Button onClick={() => setUpdateOpen(false)}>Annuler</Button><Button variant="primary" loading={busy === 'upd'} disabled={note.trim().length < 3} onClick={async () => { const r = await run('upd', () => prepareJourneyUpdate(user, trip.id, note), 'Mise à jour du voyage préparée.'); if (r) { setUpdateOpen(false); setNote(''); } }}>Préparer la mise à jour</Button></>}>
        <TextAreaField label="Motif" required value={note} onChange={(e) => setNote(e.target.value)} help="Ex. : passager ajouté à l'arrêt autorisé d'Aného." />
      </Dialog>
    </>
  );
}
