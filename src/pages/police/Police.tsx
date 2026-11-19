import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FolderOpen, CheckCheck, PenLine, StickyNote, Send, Lock } from 'lucide-react';
import { useUser } from '../../auth/AuthContext';
import { useDb } from '../../data/store';
import { authorityLabel, docTypeLabel, policeStatusLabel } from '../../domain/labels';
import { fullName } from '../../domain/passenger';
import { DEMO_RED_PREFIX } from '../../domain/screening';
import { daysUntil, fmtDate, fmtDateTime, fmtTime, isSameDay } from '../../lib/dates';
import { authorityOf, busById, corridorTrips, orgById, passengerOf, policeManifests, policeReviews, userName, activePts } from '../../services/queries';
import { noticeLabel, policeAddNote, policeConfirmReview, policeCorrectResult, policeNotifyAgencyIssue, policeOpenManifest } from '../../services/api';
import { useAction } from '../../hooks/useAction';
import { DataTable } from '../../components/DataTable';
import { DirectionLabel, ManifestTypeBadge, PoliceStatusBadge, RecipientBadge, StatusBadge, TripStatusBadge } from '../../components/status';
import { Dialog } from '../../components/Dialog';
import { Alert, Button, ErrorState, FilterBar, FilterSelect, Kpi, PageTitle, Panel, SearchField, SelectField, SimTag, TextAreaField } from '../../components/ui';
import type { AgencyNotice, PoliceReview, PoliceStatus } from '../../domain/types';

function SimNotice() {
  return (
    <Alert kind="info" title="Vérification simulée — aucune connexion aux fichiers de police.">
      Les statuts sont produits par des règles de démonstration sur des données fictives (document expiré, visa manquant, numéro commençant par « {DEMO_RED_PREFIX} »). L'officier reste seul compétent pour apprécier la situation et décider des suites.
    </Alert>
  );
}

const reviewStateBadge = (r: PoliceReview) => r.reviewState === 'pending'
  ? <StatusBadge tone="neutral">À réviser</StatusBadge>
  : r.reviewState === 'corrected' ? <StatusBadge tone="violet">Corrigé</StatusBadge> : <StatusBadge tone="green">Confirmé</StatusBadge>;

function useAuthorityLabel() {
  const user = useUser();
  const db = useDb();
  const a = authorityOf(db, user);
  return a ? authorityLabel[a] : '';
}

// ------------------------------------------------ tableau de bord

export function PoliceDashboard() {
  const user = useUser();
  const db = useDb();
  const auth = authorityOf(db, user)!;
  const manifests = policeManifests(db, user);
  const reviews = policeReviews(db, user);
  const state = (mId: string) => db.manifests.find((m) => m.id === mId)!.recipients.find((r) => r.authority === auth)!.state;
  const today = manifests.filter((m) => isSameDay(m.createdAt));
  const pending = reviews.filter((r) => r.reviewState === 'pending');
  const trips = corridorTrips(db, user);
  const approaching = trips.filter((t) => ['en_route', 'approaching_border'].includes(t.status));
  const arrived = trips.filter((t) => t.status === 'at_border');
  const queue = pending.sort((a, b) => ({ red: 0, orange: 1, green: 2 }[a.status] - { red: 0, orange: 1, green: 2 }[b.status])).slice(0, 8);
  const recent = reviews.filter((r) => r.reviewedAt).sort((a, b) => b.reviewedAt!.localeCompare(a.reviewedAt!)).slice(0, 6);
  const label = useAuthorityLabel();
  return (
    <>
      <PageTitle title="Tableau de bord" lead={`Manifestes reçus et vérifications — ${label}.`} />
      <SimNotice />
      <div style={{ height: 16 }} />
      <div className="kpis">
        <Kpi label="Manifestes reçus aujourd'hui" value={today.length} to="/police/manifests" />
        <Kpi label="En attente d'ouverture" value={manifests.filter((m) => state(m.id) === 'received').length} to="/police/manifests" />
        <Kpi label="En cours de vérification" value={manifests.filter((m) => state(m.id) === 'verifying').length} />
        <Kpi label="Bus à l'approche" value={approaching.length} to="/police/arrivals" />
        <Kpi label="Bus arrivés au poste" value={arrived.length} to="/police/arrivals" />
        <Kpi label="Dossiers à réviser" value={pending.length} to="/police/review-queue" tone={pending.some((r) => r.status === 'red') ? 'critical' : pending.length ? 'attention' : undefined} />
      </div>
      <div className="grid-main-side">
        <Panel title="File de vérification" hint="Dossiers prioritaires en premier" flush actions={<Link to="/police/review-queue" className="btn btn-ghost btn-sm">Toute la file</Link>}>
          <DataTable rows={queue} rowKey={(r) => r.id} caption="File de vérification" empty="Aucun dossier en attente."
            columns={[
              { key: 'n', header: 'Passager', render: (r) => { const pt = db.passengerTrips.find((x) => x.id === r.passengerTripId)!; return <Link to={`/police/passengers/${pt.id}`}>{fullName(passengerOf(db, pt))}</Link>; } },
              { key: 't', header: 'Voyage', render: (r) => <span className="mono">{db.trips.find((t) => t.id === r.tripId)?.reference}</span> },
              { key: 's', header: 'Statut', render: (r) => <PoliceStatusBadge s={r.status} /> },
              { key: 'a', header: 'Action', render: (r) => <Link className="btn btn-secondary btn-sm" to={`/police/passengers/${r.passengerTripId}`}>Ouvrir le dossier</Link> },
            ]} />
        </Panel>
        <Panel title="Activité récente de vérification" flush>
          <ul className="notif-list">
            {recent.length ? recent.map((r) => {
              const pt = db.passengerTrips.find((x) => x.id === r.passengerTripId)!;
              return <li key={r.id} style={{ padding: '10px 14px' }}><div className="row" style={{ justifyContent: 'space-between' }}><Link to={`/police/passengers/${pt.id}`}>{fullName(passengerOf(db, pt))}</Link><PoliceStatusBadge s={r.status} /></div><div className="small muted">{r.reviewState === 'corrected' ? 'Corrigé' : 'Confirmé'} par {userName(db, r.reviewedBy)} · {fmtDateTime(r.reviewedAt)}</div></li>;
            }) : <li className="empty">Aucune révision récente.</li>}
          </ul>
        </Panel>
      </div>
    </>
  );
}

// ------------------------------------------------ manifestes

export function PoliceManifests() {
  const user = useUser();
  const db = useDb();
  const auth = authorityOf(db, user)!;
  const [q, setQ] = useState('');
  const [state, setState] = useState('all');
  const [date, setDate] = useState('');
  const rows = policeManifests(db, user).filter((m) => {
    const t = db.trips.find((x) => x.id === m.tripId)!;
    const s = q.trim().toLowerCase();
    if (s && !`${m.reference} ${t.reference} ${busById(db, t.busId)?.registration} ${orgById(db, t.agencyId)?.name}`.toLowerCase().includes(s)) return false;
    if (state !== 'all' && m.recipients.find((r) => r.authority === auth)!.state !== state) return false;
    if (date && t.scheduledDeparture.slice(0, 10) !== date && fmtDate(t.scheduledDeparture) !== fmtDate(`${date}T12:00:00`)) return false;
    return true;
  });
  return (
    <>
      <PageTitle title="Manifestes reçus" lead={`Versions provisoires, définitives et mises à jour adressées à : ${authorityLabel[auth]}.`} />
      <Panel flush>
        <FilterBar>
          <SearchField label="Rechercher un manifeste" value={q} onChange={setQ} placeholder="Voyage, immatriculation, agence…" />
          <FilterSelect label="Traitement" value={state} onChange={setState} options={[{ value: 'all', label: 'Tous' }, { value: 'received', label: 'Reçu' }, { value: 'verifying', label: 'En cours de vérification' }, { value: 'processed', label: 'Traité' }]} />
          <div className="field"><label htmlFor="pm-date" className="small muted">Date du voyage</label><input id="pm-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          {date && <Button size="sm" variant="ghost" onClick={() => setDate('')}>Effacer la date</Button>}
        </FilterBar>
        <DataTable rows={rows} rowKey={(m) => m.id} caption="Manifestes reçus" empty="Aucun manifeste reçu pour ces critères."
          columns={[
            { key: 'r', header: 'Manifeste', render: (m) => <Link className="mono" to={`/police/manifests/${m.id}`}>{m.reference}</Link> },
            { key: 'ty', header: 'Type', render: (m) => <ManifestTypeBadge t={m.type} /> },
            { key: 't', header: 'Voyage', render: (m) => { const t = db.trips.find((x) => x.id === m.tripId)!; return <span><span className="mono">{t.reference}</span><br /><span className="small muted">{orgById(db, t.agencyId)?.name} · {busById(db, t.busId)?.registration}</span></span>; } },
            { key: 'd', header: 'Sens', render: (m) => <DirectionLabel d={db.trips.find((x) => x.id === m.tripId)!.direction} /> },
            { key: 'p', header: 'Passagers', render: (m) => m.passengerCount, className: 'num' },
            { key: 'rc', header: 'Reçu le', render: (m) => <span className="mono">{fmtDateTime(m.recipients.find((r) => r.authority === auth)!.acknowledgedAt)}</span> },
            { key: 's', header: 'Traitement', render: (m) => <RecipientBadge s={m.recipients.find((r) => r.authority === auth)!.state} /> },
          ]} />
      </Panel>
    </>
  );
}

// ------------------------------------------------ vérification d'un manifeste

export function PoliceManifestDetail() {
  const { id = '' } = useParams();
  const user = useUser();
  const db = useDb();
  const auth = authorityOf(db, user)!;
  const m = policeManifests(db, user).find((x) => x.id === id);
  const opened = useRef(false);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [rs, setRs] = useState('all');
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => {
    if (m && !opened.current) { opened.current = true; try { policeOpenManifest(user, m.id); } catch { /* ignoré */ } }
  }, [m, user]);
  const reviews = policeReviews(db, user);
  const rows = useMemo(() => (m ? m.passengerTripIds : []).map((ptId) => ({ pt: db.passengerTrips.find((x) => x.id === ptId)!, r: reviews.find((x) => x.passengerTripId === ptId) }))
    .filter(({ pt, r }) => {
      const p = passengerOf(db, pt);
      const s = q.trim().toLowerCase();
      if (s && !`${p.lastName} ${p.firstName} ${p.documentNumber} ${pt.ticketReference}`.toLowerCase().includes(s)) return false;
      if (status !== 'all' && r?.status !== status) return false;
      if (rs !== 'all' && r?.reviewState !== rs) return false;
      return true;
    }), [m, db, reviews, q, status, rs]);
  if (!m) return <ErrorState title="Manifeste introuvable" action={<Link className="btn btn-secondary" to="/police/manifests">Retour aux manifestes</Link>}>Ce manifeste n'a pas été reçu par votre service.</ErrorState>;
  const t = db.trips.find((x) => x.id === m.tripId)!;
  const rec = m.recipients.find((r) => r.authority === auth)!;
  const counts = { green: 0, orange: 0, red: 0 } as Record<PoliceStatus, number>;
  for (const id2 of m.passengerTripIds) { const r = reviews.find((x) => x.passengerTripId === id2); if (r) counts[r.status]++; }
  const selected = rows.find((x) => x.pt.id === sel) ?? null;

  return (
    <>
      <PageTitle title="Vérification des passagers" crumbs={[{ label: 'Manifestes', to: '/police/manifests' }, { label: m.reference }]}
        lead={<><ManifestTypeBadge t={m.type} /> <span className="mono">{m.reference}</span> · voyage <span className="mono">{t.reference}</span> · {orgById(db, t.agencyId)?.name} · {busById(db, t.busId)?.registration} · <DirectionLabel d={t.direction} /></>}
        badge={<RecipientBadge s={rec.state} />} />
      <SimNotice />
      <div style={{ height: 16 }} />
      <div className="kpis">
        <Kpi label="Passagers transmis" value={m.passengerCount} note={m.conventionalCount ? `+ ${m.conventionalCount} en contrôle classique` : undefined} />
        <Kpi label={policeStatusLabel.green.long} value={counts.green} />
        <Kpi label={policeStatusLabel.orange.long} value={counts.orange} tone={counts.orange ? 'attention' : undefined} />
        <Kpi label={policeStatusLabel.red.long} value={counts.red} tone={counts.red ? 'critical' : undefined} />
        <Kpi label="Départ / statut" value={<span style={{ fontSize: 18 }}>{fmtTime(t.actualDeparture ?? t.scheduledDeparture)}</span>} note={<TripStatusBadge s={t.status} />} />
      </div>
      <div className="grid-main-side">
        <Panel flush title="Passagers du manifeste">
          <FilterBar>
            <SearchField label="Rechercher un passager" value={q} onChange={setQ} placeholder="Nom, document, billet…" />
            <FilterSelect label="Statut" value={status} onChange={setStatus} options={[{ value: 'all', label: 'Tous' }, { value: 'green', label: 'Vert' }, { value: 'orange', label: 'Orange' }, { value: 'red', label: 'Rouge' }]} />
            <FilterSelect label="Révision" value={rs} onChange={setRs} options={[{ value: 'all', label: 'Toutes' }, { value: 'pending', label: 'À réviser' }, { value: 'confirmed', label: 'Confirmé' }, { value: 'corrected', label: 'Corrigé' }]} />
          </FilterBar>
          <DataTable rows={rows} rowKey={(x) => x.pt.id} caption="Passagers à vérifier" pageSize={20} selectedKey={sel} onRowClick={(x) => setSel(x.pt.id)} empty="Aucun passager pour ces filtres."
            columns={[
              { key: 'n', header: 'Passager', render: (x) => <button type="button" className="btn btn-ghost btn-sm" style={{ padding: 0, height: 'auto', textAlign: 'left', display: 'block', whiteSpace: 'normal' }} onClick={() => setSel(x.pt.id)}>{fullName(passengerOf(db, x.pt))}<br /><span className="small mono muted">{x.pt.ticketReference}</span></button> },
              { key: 'nat', header: 'Nationalité', render: (x) => passengerOf(db, x.pt).nationality },
              { key: 'doc', header: 'Document', render: (x) => { const p = passengerOf(db, x.pt); return <span>{docTypeLabel[p.documentType]}<br /><span className="small mono">exp. {fmtDate(p.documentExpiry)}</span>{daysUntil(p.documentExpiry) < 0 && <span className="small" style={{ color: 'var(--wz-red-ink)' }}> — expiré</span>}</span>; } },
              { key: 'st', header: 'Vérification', render: (x) => (x.r ? <PoliceStatusBadge s={x.r.status} /> : '—') },
              { key: 'rv', header: 'Révision', render: (x) => (x.r ? reviewStateBadge(x.r) : '—') },
            ]} />
        </Panel>
        <div>
          {selected?.r ? <ReviewPanel reviewId={selected.r.id} compact /> : <Panel title="Dossier passager"><p className="muted">Sélectionnez un passager pour ouvrir son dossier.</p></Panel>}
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------ panneau de révision (motif réservé police)

export function ReviewPanel({ reviewId, compact }: { reviewId: string; compact?: boolean }) {
  const user = useUser();
  const db = useDb();
  const { run, busy } = useAction();
  const r = policeReviews(db, user).find((x) => x.id === reviewId);
  const [dlg, setDlg] = useState<null | 'correct' | 'note' | 'notice'>(null);
  const [newStatus, setNewStatus] = useState<PoliceStatus>('green');
  const [text, setText] = useState('');
  const [issue, setIssue] = useState<AgencyNotice['issue']>('document_expired');
  const [err, setErr] = useState<string | null>(null);
  if (!r) return null;
  const pt = db.passengerTrips.find((x) => x.id === r.passengerTripId)!;
  const p = passengerOf(db, pt);
  const t = db.trips.find((x) => x.id === r.tripId)!;
  const guardian = p.guardianPassengerId ? db.passengers.find((x) => x.id === p.guardianPassengerId) : null;
  const close = () => { setDlg(null); setText(''); setErr(null); };

  return (
    <Panel title={fullName(p)} hint={<span className="mono">{pt.ticketReference}</span>} actions={compact && <Link to={`/police/passengers/${pt.id}`} className="btn btn-secondary btn-sm"><FolderOpen size={14} aria-hidden />Ouvrir le dossier</Link>}>
      <div className="stack">
        <div className="row"><PoliceStatusBadge s={r.status} long />{reviewStateBadge(r)}</div>
        <div className="alert alert-neutral" style={{ display: 'block' }}>
          <div className="small strong row" style={{ gap: 6 }}><Lock size={14} aria-hidden />Motif — réservé aux personnels de police habilités</div>
          <div style={{ marginTop: 4 }}>{r.internalReason}</div>
          {r.autoStatus !== r.status && <div className="small muted" style={{ marginTop: 4 }}>Résultat automatique initial : {policeStatusLabel[r.autoStatus].short}</div>}
          <div className="small muted" style={{ marginTop: 4 }}><SimTag>Simulation</SimTag> Réponse de vérification fictive</div>
        </div>
        <dl className="dl">
          <dt>Date de naissance</dt><dd>{fmtDate(p.dateOfBirth)}</dd>
          <dt>Nationalité</dt><dd>{p.nationality}</dd>
          <dt>Document</dt><dd>{docTypeLabel[p.documentType]} · <span className="mono">{p.documentNumber}</span></dd>
          <dt>Expiration</dt><dd>{fmtDate(p.documentExpiry)}</dd>
          <dt>Visa</dt><dd>{p.visaRequired ? (p.visaNumber ? `${p.visaNumber} (exp. ${fmtDate(p.visaExpiry)})` : 'Requis — absent') : 'Non requis'}</dd>
          <dt>Photo / document</dt><dd>{p.face ? 'Photo transmise' : 'Pas de photo'} · {p.documentFront ? 'document capturé' : 'pas de capture'} <span className="small muted">(images non conservées en démo)</span></dd>
          {guardian && <><dt>Adulte responsable</dt><dd>{fullName(guardian)}</dd></>}
          <dt>Voyage</dt><dd className="mono">{t.reference}</dd>
          <dt>Révisé par</dt><dd>{r.reviewedBy ? `${userName(db, r.reviewedBy)} · ${fmtDateTime(r.reviewedAt)}` : '—'}</dd>
        </dl>
        <div className="row">
          <Button variant="primary" icon={<CheckCheck size={16} aria-hidden />} loading={busy === 'confirm'} onClick={() => run('confirm', () => policeConfirmReview(user, r.id), 'Votre modification a été enregistrée.')}>Confirmer après vérification</Button>
          <Button icon={<PenLine size={16} aria-hidden />} onClick={() => { setNewStatus(r.status); setDlg('correct'); }}>Corriger le résultat</Button>
          <Button variant="ghost" icon={<StickyNote size={16} aria-hidden />} onClick={() => setDlg('note')}>Ajouter une note interne</Button>
          {r.status === 'orange' && <Button variant="ghost" icon={<Send size={16} aria-hidden />} onClick={() => setDlg('notice')}>Signaler une anomalie corrigeable à l'agence</Button>}
        </div>
        {r.notes.length > 0 && (
          <div>
            <h3 className="sub" style={{ marginBottom: 6 }}>Notes internes</h3>
            <ol className="timeline">{r.notes.map((n, i) => <li key={i}><span className="tl-dot" aria-hidden /><div className="small">{n.text}</div><div className="tl-meta">{userName(db, n.by)} · {fmtDateTime(n.at)}</div></li>)}</ol>
          </div>
        )}
      </div>
      <Dialog open={dlg === 'correct'} title="Corriger le résultat" onClose={close} description="La correction, son motif, l'officier et l'horodatage sont enregistrés dans le journal."
        footer={<><Button onClick={close}>Annuler</Button><Button variant="primary" loading={busy === 'corr'} onClick={async () => { if (text.trim().length < 5) { setErr('Indiquez le motif de la correction.'); return; } await run('corr', () => policeCorrectResult(user, r.id, newStatus, text), 'Votre modification a été enregistrée.'); close(); }}>Enregistrer la correction</Button></>}>
        <SelectField label="Nouveau statut" value={newStatus} onChange={(e) => setNewStatus(e.target.value as PoliceStatus)}>
          {(['green', 'orange', 'red'] as PoliceStatus[]).map((s) => <option key={s} value={s}>{policeStatusLabel[s].long}</option>)}
        </SelectField>
        <TextAreaField label="Motif de la correction" required value={text} onChange={(e) => { setText(e.target.value); setErr(null); }} error={err} />
      </Dialog>
      <Dialog open={dlg === 'note'} title="Ajouter une note interne" onClose={close} description="Visible uniquement par les personnels de police habilités de votre service."
        footer={<><Button onClick={close}>Annuler</Button><Button variant="primary" loading={busy === 'note'} onClick={async () => { if (!text.trim()) { setErr('Ce champ est obligatoire.'); return; } await run('note', () => policeAddNote(user, r.id, text), 'Votre modification a été enregistrée.'); close(); }}>Ajouter la note</Button></>}>
        <TextAreaField label="Note" required value={text} onChange={(e) => { setText(e.target.value); setErr(null); }} error={err} />
      </Dialog>
      <Dialog open={dlg === 'notice'} title="Signaler une anomalie corrigeable" onClose={close} description="L'agence reçoit uniquement la nature de l'anomalie administrative, sans statut ni motif police."
        footer={<><Button onClick={close}>Annuler</Button><Button variant="primary" loading={busy === 'notice'} onClick={async () => { await run('notice', () => policeNotifyAgencyIssue(user, r.id, issue), 'Votre modification a été enregistrée.'); close(); }}>Envoyer à l'agence</Button></>}>
        <SelectField label="Anomalie" value={issue} onChange={(e) => setIssue(e.target.value as AgencyNotice['issue'])}>
          {(Object.keys(noticeLabel) as AgencyNotice['issue'][]).map((k) => <option key={k} value={k}>{noticeLabel[k]}</option>)}
        </SelectField>
      </Dialog>
    </Panel>
  );
}

// ------------------------------------------------ passagers / file / détail

export function PolicePassengers({ queue }: { queue?: boolean }) {
  const user = useUser();
  const db = useDb();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [rs, setRs] = useState(queue ? 'pending' : 'all');
  const rows = policeReviews(db, user)
    .filter((r) => {
      const pt = db.passengerTrips.find((x) => x.id === r.passengerTripId)!;
      const p = passengerOf(db, pt);
      const t = db.trips.find((x) => x.id === r.tripId)!;
      const s = q.trim().toLowerCase();
      if (s && !`${p.lastName} ${p.firstName} ${p.documentNumber} ${pt.ticketReference} ${t.reference} ${busById(db, t.busId)?.registration}`.toLowerCase().includes(s)) return false;
      if (status !== 'all' && r.status !== status) return false;
      if (rs !== 'all' && r.reviewState !== rs) return false;
      return true;
    })
    .sort((a, b) => ({ red: 0, orange: 1, green: 2 }[a.status] - { red: 0, orange: 1, green: 2 }[b.status]) || b.createdAt.localeCompare(a.createdAt));
  return (
    <>
      <PageTitle title={queue ? 'File de vérification' : 'Passagers'} lead={queue ? 'Dossiers en attente de révision par un officier, les signalements en premier.' : 'Passagers des manifestes reçus par votre service.'} />
      <SimNotice />
      <div style={{ height: 16 }} />
      <Panel flush>
        <FilterBar>
          <SearchField label="Rechercher" value={q} onChange={setQ} placeholder="Nom, document, voyage, immatriculation…" />
          <FilterSelect label="Statut" value={status} onChange={setStatus} options={[{ value: 'all', label: 'Tous' }, { value: 'green', label: 'Vert' }, { value: 'orange', label: 'Orange' }, { value: 'red', label: 'Rouge' }]} />
          <FilterSelect label="Révision" value={rs} onChange={setRs} options={[{ value: 'all', label: 'Toutes' }, { value: 'pending', label: 'À réviser' }, { value: 'confirmed', label: 'Confirmé' }, { value: 'corrected', label: 'Corrigé' }]} />
          <span className="small muted" aria-live="polite">{rows.length} dossier(s)</span>
        </FilterBar>
        <DataTable rows={rows} rowKey={(r) => r.id} caption="Dossiers passagers" empty="Aucun dossier pour ces critères." pageSize={15}
          columns={[
            { key: 'n', header: 'Passager', render: (r) => { const pt = db.passengerTrips.find((x) => x.id === r.passengerTripId)!; return <Link to={`/police/passengers/${pt.id}`}>{fullName(passengerOf(db, pt))}</Link>; } },
            { key: 'nat', header: 'Nationalité', render: (r) => passengerOf(db, db.passengerTrips.find((x) => x.id === r.passengerTripId)!).nationality },
            { key: 't', header: 'Voyage', render: (r) => { const t = db.trips.find((x) => x.id === r.tripId)!; return <span><span className="mono">{t.reference}</span><br /><span className="small muted">{fmtDate(t.scheduledDeparture)}</span></span>; } },
            { key: 's', header: 'Vérification', render: (r) => <PoliceStatusBadge s={r.status} /> },
            { key: 'rv', header: 'Révision', render: (r) => reviewStateBadge(r) },
            { key: 'a', header: 'Action', render: (r) => <Link className="btn btn-secondary btn-sm" to={`/police/passengers/${r.passengerTripId}`}>Ouvrir le dossier</Link> },
          ]} />
      </Panel>
    </>
  );
}

export function PolicePassengerDetail() {
  const { id = '' } = useParams();
  const user = useUser();
  const db = useDb();
  const r = policeReviews(db, user).find((x) => x.passengerTripId === id);
  if (!r) return <ErrorState title="Dossier introuvable" action={<Link className="btn btn-secondary" to="/police/passengers">Retour</Link>}>Ce passager ne figure dans aucun manifeste reçu par votre service.</ErrorState>;
  const m = db.manifests.find((x) => x.id === r.manifestId);
  return (
    <>
      <PageTitle title="Dossier passager" crumbs={[{ label: 'Passagers', to: '/police/passengers' }, { label: db.passengerTrips.find((x) => x.id === id)!.ticketReference }]}
        actions={m && <Link className="btn btn-secondary" to={`/police/manifests/${m.id}`}>Voir le manifeste</Link>} />
      <SimNotice />
      <div style={{ height: 16 }} />
      <div style={{ maxWidth: 820 }}><ReviewPanel reviewId={r.id} /></div>
    </>
  );
}

export function PoliceArrivals() {
  const user = useUser();
  const db = useDb();
  const reviews = policeReviews(db, user);
  const [dir, setDir] = useState('all');
  const trips = corridorTrips(db, user).filter((t) => ['boarding_closed', 'en_route', 'approaching_border', 'at_border'].includes(t.status) && (dir === 'all' || t.direction === dir));
  return (
    <>
      <PageTitle title="Bus à l'approche et arrivés" lead="Bus en route vers le poste frontalier et bus présents au poste." />
      <Panel flush>
        <FilterBar>
          <FilterSelect label="Sens" value={dir} onChange={setDir} options={[{ value: 'all', label: 'Les deux sens' }, { value: 'TG-BJ', label: 'Togo → Bénin' }, { value: 'BJ-TG', label: 'Bénin → Togo' }]} />
        </FilterBar>
        <DataTable rows={trips} rowKey={(t) => t.id} caption="Bus à l'approche" empty="Aucun bus en approche."
          columns={[
            { key: 'r', header: 'Voyage', render: (t) => <span className="mono">{t.reference}</span> },
            { key: 'b', header: 'Immatriculation', render: (t) => <span className="mono">{busById(db, t.busId)?.registration}</span> },
            { key: 'a', header: 'Agence', render: (t) => orgById(db, t.agencyId)?.name },
            { key: 'd', header: 'Sens', render: (t) => <DirectionLabel d={t.direction} /> },
            { key: 's', header: 'Statut', render: (t) => <TripStatusBadge s={t.status} /> },
            { key: 'p', header: 'Passagers à bord', render: (t) => activePts(db, t.id).filter((pt) => pt.boardingStatus === 'boarded').length, className: 'num' },
            { key: 'v', header: 'Dossiers à réviser', render: (t) => { const n = reviews.filter((r) => r.tripId === t.id && r.reviewState === 'pending').length; return n ? <StatusBadge tone="orange">{n}</StatusBadge> : <StatusBadge tone="green">0</StatusBadge>; } },
            { key: 'm', header: 'Manifeste', render: (t) => { const m = policeManifests(db, user).find((x) => x.tripId === t.id); return m ? <Link className="btn btn-secondary btn-sm" to={`/police/manifests/${m.id}`}>Ouvrir</Link> : <span className="small">Non reçu — contrôle classique</span>; } },
          ]} />
      </Panel>
    </>
  );
}
