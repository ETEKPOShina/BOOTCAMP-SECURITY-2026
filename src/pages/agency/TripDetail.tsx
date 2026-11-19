import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { UserPlus, ScanLine, FileStack, Ban, Luggage, Pencil, CheckCircle2 } from 'lucide-react';
import { useUser } from '../../auth/AuthContext';
import { useDb } from '../../data/store';
import { can } from '../../domain/permissions';
import { borderPostName, docTypeLabel, registrationLabel, boardingLabel } from '../../domain/labels';
import { exitEntry } from '../../domain/corridor';
import { administrativeIssues, fullName } from '../../domain/passenger';
import { fmtDateTime, fmtTime } from '../../lib/dates';
import { activePts, agencyNotices, agencyTrip, busById, driverById, manifestsOfTrip, passengerOf } from '../../services/queries';
import { cancelTrip, noticeLabel, resolveNotice, updateBaggage, removePassengerFromTrip } from '../../services/api';
import { useAction } from '../../hooks/useAction';
import { DataTable } from '../../components/DataTable';
import { BoardingBadge, DirectionLabel, RegistrationBadge, TripStatusBadge } from '../../components/status';
import { EventTimeline, ManifestSummary, RouteProgress, TripProgress } from '../../components/domain';
import { ConfirmationDialog, Dialog } from '../../components/Dialog';
import { Alert, Button, ErrorState, FilterBar, FilterSelect, PageTitle, Panel, SearchField, TextField } from '../../components/ui';
import type { PassengerTrip, Trip } from '../../domain/types';

export function useAgencyTrip(): Trip | undefined {
  const { id = '' } = useParams();
  const user = useUser();
  const db = useDb();
  return agencyTrip(db, user, id);
}

export function TripNotFound() {
  return <ErrorState title="Voyage introuvable" action={<Link to="/agency/trips" className="btn btn-secondary">Retour aux voyages</Link>}>Ce voyage n'existe pas ou n'appartient pas à votre agence.</ErrorState>;
}

const OPEN_FOR_REGISTRATION = ['planned', 'preparing', 'boarding', 'boarding_closed', 'en_route', 'approaching_border'];

export function TripDetail() {
  const trip = useAgencyTrip();
  const user = useUser();
  const db = useDb();
  const { run, busy } = useAction();
  const [confirmCancel, setConfirmCancel] = useState(false);
  if (!trip) return <TripNotFound />;
  const bus = busById(db, trip.busId);
  const drv = driverById(db, trip.driverId);
  const pts = activePts(db, trip.id);
  const boarded = pts.filter((p) => p.boardingStatus === 'boarded').length;
  const manifests = manifestsOfTrip(db, trip.id);
  const { exit, entry } = exitEntry(trip.direction);
  const sideLabel = (c: 'TG' | 'BJ') => {
    const s = trip.border[c];
    if (s.completedAt) return <span className="row" style={{ gap: 6 }}><CheckCircle2 size={16} color="var(--wz-green-ink)" aria-hidden />Contrôle {c === exit ? 'de sortie' : "d'entrée"} enregistré à {fmtTime(s.completedAt)}</span>;
    if (s.arrivedAt) return 'Bus au poste — contrôle en cours';
    return 'En attente';
  };

  return (
    <>
      <PageTitle
        title={trip.reference}
        badge={<TripStatusBadge s={trip.status} />}
        crumbs={[{ label: 'Voyages', to: '/agency/trips' }, { label: trip.reference }]}
        lead={<><DirectionLabel d={trip.direction} /> · {trip.departure} → {trip.destination} · {fmtDateTime(trip.scheduledDeparture)}</>}
        actions={
          <>
            {can(user, 'agency.passenger.register') && OPEN_FOR_REGISTRATION.includes(trip.status) && <Link className="btn btn-primary" to={`/agency/trips/${trip.id}/register`}><UserPlus size={18} aria-hidden />Enregistrer un passager</Link>}
            {can(user, 'agency.boarding.operate') && ['planned', 'preparing', 'boarding'].includes(trip.status) && <Link className="btn btn-secondary" to={`/agency/trips/${trip.id}/boarding`}><ScanLine size={18} aria-hidden />Embarquement</Link>}
            <Link className="btn btn-secondary" to={`/agency/trips/${trip.id}/manifest`}><FileStack size={18} aria-hidden />Manifestes</Link>
            <Link className="btn btn-secondary" to={`/agency/trips/${trip.id}/passengers`}>Passagers ({pts.length})</Link>
            {can(user, 'agency.trip.create') && ['planned', 'preparing', 'boarding'].includes(trip.status) && <Button variant="ghost" icon={<Ban size={16} aria-hidden />} onClick={() => setConfirmCancel(true)}>Annuler le voyage</Button>}
          </>
        }
      />
      <Panel title="Progression du voyage"><TripProgress trip={trip} /></Panel>
      <div style={{ height: 16 }} />
      <div className="grid-main-side">
        <div className="stack">
          <Panel title="Informations du voyage">
            <dl className="dl">
              <dt>Bus</dt><dd className="mono">{bus?.registration} · {bus?.vehicleIdentifier} · {bus?.capacity} places</dd>
              <dt>Chauffeur</dt><dd>{drv?.name}</dd>
              <dt>Convoyeur</dt><dd>{trip.convoyeur || '—'}</dd>
              <dt>Arrêts autorisés</dt><dd>{trip.stops.join(', ') || 'Aucun'}</dd>
              <dt>Départ prévu</dt><dd>{fmtDateTime(trip.scheduledDeparture)}</dd>
              <dt>Départ réel</dt><dd>{fmtDateTime(trip.actualDeparture)}</dd>
              <dt>Arrivée à la frontière</dt><dd>{fmtDateTime(trip.borderArrival)}</dd>
              <dt>Arrivée à destination</dt><dd>{trip.actualArrival ? fmtDateTime(trip.actualArrival) : `Estimée à ${fmtTime(trip.estimatedArrival)}`}</dd>
              <dt>Passagers</dt><dd>{pts.length} inscrit(s) · {boarded} embarqué(s) · {pts.filter((p) => !p.preRegistered).length} en contrôle classique</dd>
            </dl>
          </Panel>
          <Panel title="Itinéraire"><RouteProgress trip={trip} /></Panel>
          <Panel title="Passage de la frontière" hint="Seule la réalisation des étapes est communiquée à l'agence.">
            <dl className="dl">
              <dt>{borderPostName[exit]}</dt><dd>{sideLabel(exit)}</dd>
              <dt>{borderPostName[entry]}</dt><dd>{sideLabel(entry)}</dd>
              <dt>Douanes</dt><dd>{trip.customs.length ? trip.customs.map((c) => `Prise en charge enregistrée (${c.country === 'TG' ? 'Togo' : 'Bénin'}) à ${fmtTime(c.handledAt)}`).join(' · ') : 'Aucune information'}</dd>
            </dl>
          </Panel>
        </div>
        <div className="stack">
          <Panel title="Manifestes" actions={<Link to={`/agency/trips/${trip.id}/manifest`} className="btn btn-ghost btn-sm">Détail</Link>}><ManifestSummary manifests={manifests} /></Panel>
          <Panel title="Chronologie opérationnelle"><EventTimeline db={db} tripId={trip.id} /></Panel>
        </div>
      </div>
      <ConfirmationDialog open={confirmCancel} title="Annuler ce voyage ?" message="Le voyage passera au statut « Annulé ». Cette action est enregistrée dans l'historique." confirmLabel="Annuler le voyage" danger
        loading={busy === 'cancel'} onClose={() => setConfirmCancel(false)} onConfirm={async () => { await run('cancel', () => cancelTrip(user, trip.id), 'Voyage annulé.'); setConfirmCancel(false); }} />
    </>
  );
}

export function TripPassengers() {
  const trip = useAgencyTrip();
  const user = useUser();
  const db = useDb();
  const { run, busy } = useAction();
  const [q, setQ] = useState('');
  const [reg, setReg] = useState('all');
  const [board, setBoard] = useState('all');
  const [editing, setEditing] = useState<PassengerTrip | null>(null);
  const [bags, setBags] = useState({ count: '0', goods: '' });
  const [removing, setRemoving] = useState<PassengerTrip | null>(null);
  const pts = useMemo(() => (trip ? activePts(db, trip.id) : []), [trip, db]);
  const rows = useMemo(() => pts.filter((pt) => {
    const p = passengerOf(db, pt);
    const s = q.trim().toLowerCase();
    if (s && !`${p.lastName} ${p.firstName} ${pt.ticketReference} ${p.documentNumber}`.toLowerCase().includes(s)) return false;
    if (reg !== 'all' && (reg === 'conventional' ? pt.preRegistered : p.registrationStatus !== reg || !pt.preRegistered)) return false;
    if (board !== 'all' && pt.boardingStatus !== board) return false;
    return true;
  }), [pts, q, reg, board, db]);
  if (!trip) return <TripNotFound />;
  const notices = agencyNotices(db, user).filter((n) => !n.resolvedAt && pts.some((pt) => pt.id === n.passengerTripId));
  const canEdit = can(user, 'agency.passenger.register') && trip.status !== 'arrived' && trip.status !== 'cancelled';

  return (
    <>
      <PageTitle
        title="Passagers du voyage"
        crumbs={[{ label: 'Voyages', to: '/agency/trips' }, { label: trip.reference, to: `/agency/trips/${trip.id}` }, { label: 'Passagers' }]}
        lead={<><span className="mono">{trip.reference}</span> · <DirectionLabel d={trip.direction} /> · départ {fmtDateTime(trip.scheduledDeparture)}</>}
        actions={canEdit && <Link to={`/agency/trips/${trip.id}/register`} className="btn btn-primary"><UserPlus size={18} aria-hidden />Ajouter un passager</Link>}
      />
      {notices.length > 0 && (
        <div className="stack-sm" style={{ marginBottom: 16 }}>
          {notices.map((n) => {
            const pt = pts.find((x) => x.id === n.passengerTripId)!;
            return (
              <Alert key={n.id} kind="warning" title={`Anomalie administrative à corriger — ${fullName(passengerOf(db, pt))}`}
                action={canEdit && <div className="row"><Link className="btn btn-secondary btn-sm" to={`/agency/passengers/${pt.passengerId}`}>Corriger le dossier</Link><Button size="sm" variant="ghost" onClick={() => run('n', () => resolveNotice(user, n.id), 'Votre modification a été enregistrée.')}>Marquer comme traitée</Button></div>}>
                Billet <span className="mono">{pt.ticketReference}</span> : {noticeLabel[n.issue]}. Le voyageur peut régulariser sa situation ou se présenter au contrôle classique.
              </Alert>
            );
          })}
        </div>
      )}
      <Panel flush>
        <FilterBar>
          <SearchField label="Rechercher un passager" value={q} onChange={setQ} placeholder="Nom, billet, document…" />
          <FilterSelect label="Enregistrement" value={reg} onChange={setReg} options={[{ value: 'all', label: 'Tous' }, ...Object.entries(registrationLabel).map(([value, label]) => ({ value, label })), { value: 'conventional', label: 'Contrôle classique' }]} />
          <FilterSelect label="Embarquement" value={board} onChange={setBoard} options={[{ value: 'all', label: 'Tous' }, ...Object.entries(boardingLabel).map(([value, label]) => ({ value, label }))]} />
          <span className="small muted" aria-live="polite">{rows.length} passager(s)</span>
        </FilterBar>
        <DataTable
          rows={rows} rowKey={(pt) => pt.id} caption="Passagers du voyage" empty="Aucun passager." emptyHint={canEdit ? 'Utilisez « Ajouter un passager » pour enregistrer un voyageur.' : undefined}
          columns={[
            { key: 'n', header: 'Passager', render: (pt) => { const p = passengerOf(db, pt); return <Link to={`/agency/passengers/${p.id}`}>{fullName(p)}</Link>; } },
            { key: 't', header: 'Billet', render: (pt) => <Link to={`/agency/tickets/${pt.ticketReference}`} className="mono">{pt.ticketReference}</Link> },
            { key: 'd', header: 'Document', render: (pt) => { const p = passengerOf(db, pt); return pt.preRegistered ? docTypeLabel[p.documentType] : <span className="muted">Non collecté</span>; } },
            { key: 'r', header: 'Enregistrement', render: (pt) => { const p = passengerOf(db, pt); const iss = administrativeIssues(p); return pt.preRegistered ? <span title={iss.join(' · ')}><RegistrationBadge s={p.registrationStatus} /></span> : <span className="badge badge-outline">Contrôle classique</span>; } },
            { key: 'b', header: 'Embarquement', render: (pt) => <BoardingBadge s={pt.boardingStatus} /> },
            { key: 'bg', header: 'Bagages', render: (pt) => <span>{pt.baggageCount}{pt.commercialGoods && <span className="small muted"> · marchandises</span>}</span>, className: 'num' },
            { key: 'a', header: 'Actions', render: (pt) => canEdit ? (
              <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                <Button size="sm" variant="ghost" icon={<Luggage size={14} aria-hidden />} onClick={() => { setEditing(pt); setBags({ count: String(pt.baggageCount), goods: pt.commercialGoods }); }}>Bagages</Button>
                <Button size="sm" variant="ghost" icon={<Pencil size={14} aria-hidden />} onClick={() => setRemoving(pt)}>Retirer</Button>
              </div>
            ) : <Link to={`/agency/tickets/${pt.ticketReference}`} className="btn btn-ghost btn-sm">Billet</Link> },
          ]}
        />
      </Panel>
      <Dialog open={!!editing} title="Bagages du passager" onClose={() => setEditing(null)} description={editing ? `Billet ${editing.ticketReference}` : undefined}
        footer={<><Button onClick={() => setEditing(null)}>Annuler</Button><Button variant="primary" loading={busy === 'bags'} onClick={async () => {
          const c = Number(bags.count);
          if (!Number.isInteger(c) || c < 0 || c > 20) return;
          await run('bags', () => updateBaggage(user, editing!.id, c, bags.goods), 'Votre modification a été enregistrée.');
          setEditing(null);
        }}>Enregistrer</Button></>}>
        <TextField label="Nombre de bagages" type="number" min={0} max={20} value={bags.count} onChange={(e) => setBags({ ...bags, count: e.target.value })} error={!Number.isInteger(Number(bags.count)) || Number(bags.count) < 0 || Number(bags.count) > 20 ? 'Saisissez un nombre entre 0 et 20.' : null} />
        <TextField label="Marchandises commerciales déclarées" value={bags.goods} onChange={(e) => setBags({ ...bags, goods: e.target.value })} help="Laisser vide si aucune marchandise. Les étiquettes seront régénérées." />
      </Dialog>
      <ConfirmationDialog open={!!removing} title="Retirer ce passager du voyage ?" message="Le billet sera désactivé. Si une liste a déjà été transmise, préparez une mise à jour du voyage." confirmLabel="Retirer le passager" danger
        loading={busy === 'rm'} onClose={() => setRemoving(null)} onConfirm={async () => { await run('rm', () => removePassengerFromTrip(user, removing!.id), 'Passager retiré du voyage.'); setRemoving(null); }} />
    </>
  );
}
