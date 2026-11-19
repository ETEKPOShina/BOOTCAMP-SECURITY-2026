import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ShieldCheck, Ban, FileSearch } from 'lucide-react';
import { useUser } from '../../auth/AuthContext';
import { useDb } from '../../data/store';
import { can } from '../../domain/permissions';
import { consentLabel, docTypeLabel, registrationLabel } from '../../domain/labels';
import { administrativeIssues, fullName, isMinor } from '../../domain/passenger';
import { ageOn, fmtDate, fmtDateTime } from '../../lib/dates';
import { agencyNotices, agencyPassengers, agencyTrips, userName } from '../../services/queries';
import { noticeLabel, recordRightsRequest, updateConsent, updatePassengerCaptures } from '../../services/api';
import { useAction } from '../../hooks/useAction';
import { DataTable } from '../../components/DataTable';
import { BoardingBadge, ConsentBadge, RegistrationBadge, TripStatusBadge } from '../../components/status';
import { ConfirmationDialog, Dialog } from '../../components/Dialog';
import { Alert, Button, ErrorState, FileUpload, FilterBar, FilterSelect, PageTitle, Panel, SearchField, TextField } from '../../components/ui';
import type { CaptureMeta } from '../../domain/types';

export function PassengersList() {
  const user = useUser();
  const db = useDb();
  const [q, setQ] = useState('');
  const [reg, setReg] = useState('all');
  const [consent, setConsent] = useState('all');
  const list = agencyPassengers(db, user);
  const rows = useMemo(() => list.filter((p) => {
    const s = q.trim().toLowerCase().replace(/\s+/g, '');
    if (s && !`${p.lastName}${p.firstName}${p.documentNumber}${p.phone}`.toLowerCase().replace(/\s+/g, '').includes(s)) return false;
    if (reg !== 'all' && p.registrationStatus !== reg) return false;
    if (consent !== 'all' && p.consentStatus !== consent) return false;
    return true;
  }).sort((a, b) => a.lastName.localeCompare(b.lastName)), [list, q, reg, consent]);
  return (
    <>
      <PageTitle title="Passagers" lead="Voyageurs enregistrés par votre agence. Recherche par nom, numéro de document ou téléphone." />
      <Panel flush>
        <FilterBar>
          <SearchField label="Rechercher un passager" value={q} onChange={setQ} placeholder="Nom, document, téléphone…" />
          <FilterSelect label="Enregistrement" value={reg} onChange={setReg} options={[{ value: 'all', label: 'Tous' }, ...Object.entries(registrationLabel).map(([value, label]) => ({ value, label }))]} />
          <FilterSelect label="Consentement" value={consent} onChange={setConsent} options={[{ value: 'all', label: 'Tous' }, ...Object.entries(consentLabel).map(([value, label]) => ({ value, label }))]} />
          <span className="small muted" aria-live="polite">{rows.length} passager(s)</span>
        </FilterBar>
        <DataTable
          rows={rows} rowKey={(p) => p.id} caption="Passagers de l'agence" empty="Aucun passager trouvé."
          columns={[
            { key: 'n', header: 'Nom', render: (p) => <Link to={`/agency/passengers/${p.id}`}>{fullName(p)}</Link> },
            { key: 'nat', header: 'Nationalité', render: (p) => p.nationality },
            { key: 'doc', header: 'Document', render: (p) => <span>{docTypeLabel[p.documentType]}<br /><span className="small mono muted">{p.consentStatus === 'declined' ? 'non collecté' : p.documentNumber}</span></span> },
            { key: 'tel', header: 'Téléphone', render: (p) => <span className="mono">{p.phone || '—'}</span> },
            { key: 'c', header: 'Consentement', render: (p) => <ConsentBadge s={p.consentStatus} /> },
            { key: 'r', header: 'Enregistrement', render: (p) => <RegistrationBadge s={p.registrationStatus} /> },
            { key: 'v', header: 'Voyages', render: (p) => db.passengerTrips.filter((pt) => pt.passengerId === p.id && !pt.removedAt).length, className: 'num' },
          ]}
        />
      </Panel>
    </>
  );
}

export function PassengerDetail() {
  const { id = '' } = useParams();
  const user = useUser();
  const db = useDb();
  const { run, busy } = useAction();
  const [edit, setEdit] = useState(false);
  const [patch, setPatch] = useState<{ documentNumber: string; documentExpiry: string; visaNumber: string; visaExpiry: string; phone: string; documentFront: CaptureMeta | null; face: CaptureMeta | null }>({ documentNumber: '', documentExpiry: '', visaNumber: '', visaExpiry: '', phone: '', documentFront: null, face: null });
  const [rights, setRights] = useState<null | 'access' | 'rectification' | 'deletion'>(null);
  const [consentDlg, setConsentDlg] = useState<null | 'given' | 'declined'>(null);
  const p = agencyPassengers(db, user).find((x) => x.id === id);
  if (!p) return <ErrorState title="Passager introuvable" action={<Link to="/agency/passengers" className="btn btn-secondary">Retour aux passagers</Link>}>Ce dossier n'existe pas ou n'appartient pas à votre agence.</ErrorState>;
  const trips = agencyTrips(db, user);
  const pts = db.passengerTrips.filter((pt) => pt.passengerId === p.id);
  const issues = administrativeIssues(p);
  const notices = agencyNotices(db, user).filter((n) => !n.resolvedAt && pts.some((pt) => pt.id === n.passengerTripId));
  const guardian = p.guardianPassengerId ? db.passengers.find((x) => x.id === p.guardianPassengerId && x.agencyId === user.organizationId) : null;
  const canEdit = can(user, 'agency.passenger.register');
  const rightsLabel = { access: "Demande d'accès", rectification: 'Demande de rectification', deletion: 'Demande de suppression' } as const;

  return (
    <>
      <PageTitle
        title={fullName(p)}
        badge={<RegistrationBadge s={p.registrationStatus} />}
        crumbs={[{ label: 'Passagers', to: '/agency/passengers' }, { label: fullName(p) }]}
        actions={canEdit && (
          <>
            {p.consentStatus !== 'declined' && <Button variant="primary" onClick={() => { setPatch({ documentNumber: p.documentNumber, documentExpiry: p.documentExpiry, visaNumber: p.visaNumber, visaExpiry: p.visaExpiry, phone: p.phone, documentFront: p.documentFront, face: p.face }); setEdit(true); }}>Corriger le dossier</Button>}
            {p.consentStatus !== 'given' && <Button icon={<ShieldCheck size={16} aria-hidden />} onClick={() => setConsentDlg('given')}>Recueillir le consentement</Button>}
            {p.consentStatus !== 'declined' && <Button variant="ghost" icon={<Ban size={16} aria-hidden />} onClick={() => setConsentDlg('declined')}>Enregistrer un refus</Button>}
          </>
        )}
      />
      {(issues.length > 0 || notices.length > 0) && (
        <div className="stack-sm" style={{ marginBottom: 16 }}>
          {notices.map((n) => <Alert key={n.id} kind="warning" title="Anomalie administrative signalée par un service">{noticeLabel[n.issue]} — le voyageur peut la corriger ou passer au contrôle classique.</Alert>)}
          {issues.length > 0 && <Alert kind="warning" title="Éléments à compléter">{issues.join(' · ')}</Alert>}
        </div>
      )}
      <div className="grid-2">
        <Panel title="Identité">
          <dl className="dl">
            <dt>Nom</dt><dd>{p.lastName.toUpperCase()}</dd>
            <dt>Prénoms</dt><dd>{p.firstName}</dd>
            <dt>Date de naissance</dt><dd>{p.dateOfBirth ? `${fmtDate(p.dateOfBirth)} (${ageOn(p.dateOfBirth)} ans)` : '—'}</dd>
            <dt>Nationalité</dt><dd>{p.nationality || '—'}</dd>
            <dt>Téléphone</dt><dd className="mono">{p.phone || '—'}</dd>
            {isMinor(p) && <><dt>Adulte responsable</dt><dd>{guardian ? <Link to={`/agency/passengers/${guardian.id}`}>{fullName(guardian)}</Link> : 'Non renseigné'}</dd></>}
          </dl>
        </Panel>
        <Panel title="Document de voyage" hint="Les images ne sont pas conservées dans la démonstration ; seules leurs métadonnées le sont.">
          {p.consentStatus === 'declined' ? <p className="muted">Non collecté : le voyageur a refusé la pré-inscription (contrôle classique).</p> : (
            <dl className="dl">
              <dt>Type</dt><dd>{docTypeLabel[p.documentType]}</dd>
              <dt>Numéro</dt><dd className="mono">{p.documentNumber || '—'}</dd>
              <dt>Expiration</dt><dd>{fmtDate(p.documentExpiry)}</dd>
              <dt>Recto / verso</dt><dd>{p.documentFront ? 'Capturé' : 'Manquant'} / {p.documentBack ? 'Capturé' : '—'}</dd>
              <dt>Photo du visage</dt><dd>{p.face ? `Capturée${p.face.simulated ? ' (simulation)' : ''}` : 'Manquante'}</dd>
              <dt>Visa</dt><dd>{p.visaRequired ? (p.visaNumber ? `${p.visaNumber} · expire le ${fmtDate(p.visaExpiry)}` : 'Requis — non renseigné') : 'Non requis'}</dd>
            </dl>
          )}
        </Panel>
        <Panel title="Consentement">
          <dl className="dl">
            <dt>Statut</dt><dd><ConsentBadge s={p.consentStatus} /></dd>
            <dt>Horodatage</dt><dd>{fmtDateTime(p.consentAt)}</dd>
            <dt>Recueilli par</dt><dd>{userName(db, p.consentRecordedBy)}</dd>
          </dl>
        </Panel>
        <Panel title="Droits du voyageur" hint="Demandes d'accès, de rectification et de suppression">
          <div className="stack-sm">
            {p.rightsRequests.length ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>{p.rightsRequests.map((r, i) => <li key={i}>{rightsLabel[r.type]} — {fmtDateTime(r.at)} ({userName(db, r.by)})</li>)}</ul>
            ) : <p className="muted">Aucune demande enregistrée.</p>}
            {canEdit && <div className="row">{(['access', 'rectification', 'deletion'] as const).map((t) => <Button key={t} size="sm" icon={<FileSearch size={14} aria-hidden />} onClick={() => setRights(t)}>{rightsLabel[t]}</Button>)}</div>}
          </div>
        </Panel>
      </div>
      <div style={{ height: 16 }} />
      <Panel title="Voyages" flush>
        <DataTable
          rows={pts} rowKey={(pt) => pt.id} caption="Voyages du passager"
          columns={[
            { key: 't', header: 'Voyage', render: (pt) => { const t = trips.find((x) => x.id === pt.tripId); return t ? <Link className="mono" to={`/agency/trips/${t.id}`}>{t.reference}</Link> : '—'; } },
            { key: 'd', header: 'Date', render: (pt) => fmtDateTime(trips.find((x) => x.id === pt.tripId)?.scheduledDeparture) },
            { key: 'k', header: 'Billet', render: (pt) => <Link className="mono" to={`/agency/tickets/${pt.ticketReference}`}>{pt.ticketReference}</Link> },
            { key: 's', header: 'Voyage', render: (pt) => { const t = trips.find((x) => x.id === pt.tripId); return t ? <TripStatusBadge s={t.status} /> : '—'; } },
            { key: 'b', header: 'Embarquement', render: (pt) => (pt.removedAt ? <span className="badge badge-outline">Retiré</span> : <BoardingBadge s={pt.boardingStatus} />) },
          ]}
        />
      </Panel>

      <Dialog open={edit} title="Corriger le dossier" onClose={() => setEdit(false)} wide
        footer={<><Button onClick={() => setEdit(false)}>Annuler</Button><Button variant="primary" loading={busy === 'save'} onClick={async () => { await run('save', () => updatePassengerCaptures(user, p.id, patch), 'Votre modification a été enregistrée.'); setEdit(false); }}>Enregistrer</Button></>}>
        <div className="form-grid">
          <TextField label="Numéro de document" value={patch.documentNumber} onChange={(e) => setPatch({ ...patch, documentNumber: e.target.value.toUpperCase() })} />
          <TextField label="Date d'expiration" type="date" value={patch.documentExpiry} onChange={(e) => setPatch({ ...patch, documentExpiry: e.target.value })} />
          <TextField label="Numéro de visa" value={patch.visaNumber} onChange={(e) => setPatch({ ...patch, visaNumber: e.target.value.toUpperCase() })} />
          <TextField label="Expiration du visa" type="date" value={patch.visaExpiry} onChange={(e) => setPatch({ ...patch, visaExpiry: e.target.value })} />
          <TextField label="Téléphone" value={patch.phone} onChange={(e) => setPatch({ ...patch, phone: e.target.value })} />
          <div />
          <FileUpload label="Recto du document" value={patch.documentFront} onChange={(v) => setPatch({ ...patch, documentFront: v })} disabled={p.consentStatus !== 'given'} />
          <FileUpload label="Photo du visage" value={patch.face} onChange={(v) => setPatch({ ...patch, face: v })} disabled={p.consentStatus !== 'given'} />
        </div>
        {p.consentStatus !== 'given' && <Alert kind="warning">Recueillez le consentement avant toute capture d'image.</Alert>}
      </Dialog>
      <ConfirmationDialog open={!!rights} title={rights ? rightsLabel[rights] : ''} confirmLabel="Enregistrer la demande" loading={busy === 'rights'}
        message="La demande sera horodatée, inscrite à l'historique et signalée à l'administration centrale. Son traitement suit la procédure qui sera validée avec les autorités de protection des données."
        onClose={() => setRights(null)} onConfirm={async () => { await run('rights', () => recordRightsRequest(user, p.id, rights!), 'Votre modification a été enregistrée.'); setRights(null); }} />
      <ConfirmationDialog open={!!consentDlg} title={consentDlg === 'given' ? 'Recueillir le consentement' : 'Enregistrer un refus de pré-inscription'} confirmLabel="Confirmer" loading={busy === 'consent'}
        message={consentDlg === 'given' ? 'Confirmez que le voyageur a reçu l’information et accepte la pré-inscription.' : 'Les images éventuellement capturées seront retirées. Le voyageur passera par le contrôle classique pour ses prochains voyages non encore effectués.'}
        onClose={() => setConsentDlg(null)} onConfirm={async () => { await run('consent', () => updateConsent(user, p.id, consentDlg!), 'Votre modification a été enregistrée.'); setConsentDlg(null); }} />
    </>
  );
}
