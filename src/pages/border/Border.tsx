import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ScanSearch, Users, ShieldCheck, LogOut, LogIn, AlertTriangle, UserCheck, Undo2, MapPinCheck, Camera } from 'lucide-react';
import { useUser } from '../../auth/AuthContext';
import { useDb } from '../../data/store';
import { borderPostName, countryAuthority, countryLabel, docTypeLabel, authorityLabel } from '../../domain/labels';
import { exitEntry } from '../../domain/corridor';
import { fullName, maskDocument } from '../../domain/passenger';
import { fmtDateTime, fmtTime, isSameDay } from '../../lib/dates';
import { activePts, borderStatusView, busById, corridorTrips, countryOf, orgById, passengerOf, userName } from '../../services/queries';
import { borderCompleteControl, borderRecordArrival, borderRecordCount, borderRecordPassengerCheck, expectedOnBoard, parseTicketInput } from '../../services/api';
import { useAction } from '../../hooks/useAction';
import { DataTable } from '../../components/DataTable';
import { DirectionLabel, PoliceStatusBadge, RecipientBadge, StatusBadge, TripStatusBadge } from '../../components/status';
import { ConfirmationDialog, Dialog } from '../../components/Dialog';
import { Alert, Button, ErrorState, FilterBar, FilterSelect, Kpi, PageTitle, Panel, SimTag, TextField } from '../../components/ui';
import type { Country, DbState, Trip, User } from '../../domain/types';

function sideOf(t: Trip, c: Country) { return t.border[c]; }

/** Bus présent au poste de ce pays (arrivée constatée, ou bus à la frontière côté sortie). */
function atPost(t: Trip, c: Country) {
  return !!t.border[c].arrivedAt || (t.status === 'at_border' && (exitEntry(t.direction).exit === c || !!t.border[exitEntry(t.direction).exit].completedAt));
}

function manifestStateFor(db: DbState, t: Trip, c: Country) {
  const ms = db.manifests.filter((m) => m.tripId === t.id).sort((a, b) => b.version - a.version);
  const auth = countryAuthority[c];
  const received = ms.find((m) => m.recipients.some((r) => r.authority === auth && ['received', 'verifying', 'processed'].includes(r.state)));
  return { manifest: received, state: received?.recipients.find((r) => r.authority === auth)?.state ?? null };
}

function arrivalState(t: Trip, c: Country) {
  const s = sideOf(t, c);
  if (s.completedAt) return <StatusBadge tone="green" icon={<ShieldCheck size={14} aria-hidden />}>Contrôle enregistré</StatusBadge>;
  if (atPost(t, c)) return <StatusBadge tone="orange" icon={<MapPinCheck size={14} aria-hidden />}>Au poste</StatusBadge>;
  if (t.status === 'approaching_border') return <StatusBadge tone="violet">À l'approche</StatusBadge>;
  return <StatusBadge tone="neutral">Attendu</StatusBadge>;
}

function useBorderContext() {
  const user = useUser();
  const db = useDb();
  const c = countryOf(db, user)!;
  return { user, db, c };
}

export function findTrip(db: DbState, user: User, raw: string): Trip | undefined {
  const s = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!s) return undefined;
  // Priorité aux voyages en cours : un même bus peut avoir des voyages passés.
  const rank = (t: Trip) => (['en_route', 'approaching_border', 'at_border'].includes(t.status) ? 0 : t.status === 'boarding_closed' ? 1 : t.status === 'arrived' ? 3 : 2);
  const trips = [...corridorTrips(db, user)].sort((a, b) => rank(a) - rank(b));
  const ticket = parseTicketInput(s);
  const pt = db.passengerTrips.find((x) => x.ticketReference === ticket);
  if (pt) return trips.find((t) => t.id === pt.tripId);
  return trips.find((t) => t.reference.toUpperCase() === s || busById(db, t.busId)?.registration.toUpperCase().replace(/\s+/g, ' ') === s)
    ?? trips.find((t) => t.reference.toUpperCase().includes(s) || (busById(db, t.busId)?.registration.toUpperCase().replace(/\s+/g, '') ?? '').includes(s.replace(/\s+/g, '')));
}

function IdentifyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, db } = useBorderContext();
  const nav = useNavigate();
  const [v, setV] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!v.trim()) { setErr('Ce champ est obligatoire.'); return; }
    const t = findTrip(db, user, v);
    if (!t) { setErr('Aucun voyage trouvé. Vérifiez la saisie ou appliquez le contrôle classique.'); return; }
    onClose(); setV(''); nav(`/border/trips/${t.id}`);
  };
  return (
    <Dialog open={open} title="Identifier un bus" onClose={onClose} description="Saisissez l'immatriculation, la référence du voyage ou le contenu du QR code d'un billet."
      footer={<><Button onClick={onClose}>Annuler</Button><Button variant="primary" onClick={() => submit()}>Identifier le voyage</Button></>}>
      <form onSubmit={submit}><TextField label="Immatriculation, référence ou QR code" value={v} onChange={(e) => { setV(e.target.value); setErr(null); }} error={err} placeholder="TG 4821 DM ou WZP-…" autoFocus help="Lecteur de codes compatible clavier. Aucune caméra n'est connectée." /></form>
    </Dialog>
  );
}

function ExpectedTable({ trips, c, db }: { trips: Trip[]; c: Country; db: DbState }) {
  return (
    <DataTable rows={trips} rowKey={(t) => t.id} caption="Bus attendus" empty="Aucun bus attendu."
      columns={[
        { key: 'h', header: 'Heure estimée', render: (t) => <span className="mono strong">{fmtTime(t.borderArrival ?? new Date(new Date(t.actualDeparture ?? t.scheduledDeparture).getTime() + (t.direction === (c === 'TG' ? 'TG-BJ' : 'BJ-TG') ? 60 : 105) * 60000).toISOString())}</span> },
        { key: 'a', header: 'Agence', render: (t) => orgById(db, t.agencyId)?.name },
        { key: 'i', header: 'Immatriculation', render: (t) => <span className="mono">{busById(db, t.busId)?.registration}</span> },
        { key: 'r', header: 'Référence du voyage', render: (t) => <Link className="mono" to={`/border/trips/${t.id}`}>{t.reference}</Link> },
        { key: 'd', header: 'Sens du trajet', render: (t) => <DirectionLabel d={t.direction} /> },
        { key: 'p', header: 'Passagers', render: (t) => expectedOnBoard(db, t), className: 'num' },
        { key: 'm', header: 'Manifeste', render: (t) => { const s = manifestStateFor(db, t, c).state; return s ? <RecipientBadge s={s} /> : <StatusBadge tone="red">Non reçu</StatusBadge>; } },
        { key: 's', header: "État d'arrivée", render: (t) => arrivalState(t, c) },
      ]} />
  );
}

// ------------------------------------------------ tableau de bord

export function BorderDashboard() {
  const { user, db, c } = useBorderContext();
  const [identify, setIdentify] = useState(false);
  const trips = corridorTrips(db, user);
  const pendingHere = trips.filter((t) => !sideOf(t, c).completedAt && t.status !== 'arrived');
  const expected = pendingHere.filter((t) => !atPost(t, c));
  const approaching = pendingHere.filter((t) => t.status === 'approaching_border');
  const here = pendingHere.filter((t) => atPost(t, c));
  const processedToday = trips.filter((t) => sideOf(t, c).completedAt && isSameDay(sideOf(t, c).completedAt!));
  const discrepancies = trips.filter((t) => { const s = sideOf(t, c); return (s.actualCount !== null && s.actualCount !== expectedOnBoard(db, t)) || Object.values(s.checks).includes('discrepancy'); });
  const attention = pendingHere.filter((t) => !manifestStateFor(db, t, c).state);
  return (
    <>
      <PageTitle title="Tableau de bord" lead={`${borderPostName[c]} — préparation des arrivées et enregistrement des contrôles.`} actions={<Button variant="primary" icon={<ScanSearch size={18} aria-hidden />} onClick={() => setIdentify(true)}>Identifier un bus</Button>} />
      <div className="kpis">
        <Kpi label="Bus attendus" value={expected.length} to="/border/expected-buses" />
        <Kpi label="Bus à l'approche" value={approaching.length} to="/border/expected-buses" />
        <Kpi label="Bus au poste" value={here.length} to="/border/arrivals" tone={here.length ? 'attention' : undefined} />
        <Kpi label="Bus traités aujourd'hui" value={processedToday.length} to="/border/history" />
        <Kpi label="Écarts de comptage" value={discrepancies.length} to="/border/discrepancies" tone={discrepancies.length ? 'attention' : undefined} />
        <Kpi label="Attention manuelle" value={attention.length} note="Manifeste non reçu" tone={attention.length ? 'attention' : undefined} />
      </div>
      {attention.length > 0 && <><Alert kind="warning" title="Manifeste non reçu pour certains bus.">Ces bus restent éligibles au contrôle classique : {attention.map((t) => t.reference).join(', ')}.</Alert><div style={{ height: 16 }} /></>}
      <Panel title="Bus attendus" flush actions={<Link to="/border/expected-buses" className="btn btn-ghost btn-sm">Tout voir</Link>}>
        <ExpectedTable trips={pendingHere} c={c} db={db} />
      </Panel>
      <IdentifyDialog open={identify} onClose={() => setIdentify(false)} />
    </>
  );
}

export function BorderExpected({ arrivals }: { arrivals?: boolean }) {
  const { user, db, c } = useBorderContext();
  const [dir, setDir] = useState('all');
  const [identify, setIdentify] = useState(false);
  const trips = corridorTrips(db, user).filter((t) => (dir === 'all' || t.direction === dir) && t.status !== 'arrived' && !sideOf(t, c).completedAt)
    .filter((t) => (arrivals ? atPost(t, c) : !atPost(t, c)));
  return (
    <>
      <PageTitle title={arrivals ? 'Bus arrivés' : 'Bus attendus'} lead={arrivals ? 'Bus présents au poste, en attente d’enregistrement du contrôle.' : 'Bus en préparation ou en route vers le poste.'} actions={<Button variant="primary" icon={<ScanSearch size={18} aria-hidden />} onClick={() => setIdentify(true)}>Identifier un bus</Button>} />
      <Panel flush>
        <FilterBar><FilterSelect label="Sens" value={dir} onChange={setDir} options={[{ value: 'all', label: 'Les deux sens' }, { value: 'TG-BJ', label: 'Togo → Bénin' }, { value: 'BJ-TG', label: 'Bénin → Togo' }]} /></FilterBar>
        <ExpectedTable trips={trips} c={c} db={db} />
      </Panel>
      <IdentifyDialog open={identify} onClose={() => setIdentify(false)} />
    </>
  );
}

// ------------------------------------------------ contrôle d'un bus

export function BorderTrip() {
  const { id = '' } = useParams();
  const { user, db, c } = useBorderContext();
  const { run, busy } = useAction();
  const [countDlg, setCountDlg] = useState(false);
  const [count, setCount] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [filter, setFilter] = useState('all');
  const t = corridorTrips(db, user).find((x) => x.id === id);
  const rows = useMemo(() => {
    if (!t) return [];
    const ms = manifestStateFor(db, t, c).manifest;
    const ids = new Set(ms?.passengerTripIds ?? []);
    return activePts(db, t.id).filter((pt) => pt.boardingStatus === 'boarded' && pt.preRegistered && (ids.size === 0 || ids.has(pt.id)));
  }, [t, db, c]);
  if (!t) return <ErrorState title="Voyage introuvable" action={<Link className="btn btn-secondary" to="/border/expected-buses">Bus attendus</Link>}>Ce voyage n'est pas (ou plus) visible depuis le poste.</ErrorState>;
  const side = sideOf(t, c);
  const { exit, entry } = exitEntry(t.direction);
  const isExit = c === exit;
  const other: Country = c === 'TG' ? 'BJ' : 'TG';
  const expected = expectedOnBoard(db, t);
  const conventional = activePts(db, t.id).filter((pt) => pt.boardingStatus === 'boarded' && !pt.preRegistered).length;
  const ms = manifestStateFor(db, t, c);
  const discrepancy = side.actualCount !== null && side.actualCount !== expected;
  const locked = !!side.completedAt;
  const exitPending = !isExit && !t.border[exit].completedAt;
  const shown = rows.filter((pt) => filter === 'all' || (filter === 'pending' ? !side.checks[pt.id] : side.checks[pt.id] === filter));

  return (
    <>
      <PageTitle title="Contrôle des bus à l'arrivée" crumbs={[{ label: 'Bus attendus', to: '/border/expected-buses' }, { label: t.reference }]}
        lead={<><span className="mono strong">{busById(db, t.busId)?.registration}</span> · <span className="mono">{t.reference}</span> · {orgById(db, t.agencyId)?.name} · <DirectionLabel d={t.direction} /></>}
        badge={<TripStatusBadge s={t.status} />}
        actions={
          <>
            {!side.arrivedAt && <Button variant="primary" icon={<MapPinCheck size={18} aria-hidden />} loading={busy === 'arr'} onClick={() => run('arr', () => borderRecordArrival(user, t.id), 'Arrivée du bus enregistrée.')}>Identifier le voyage</Button>}
            {!locked && <Button icon={<Users size={18} aria-hidden />} onClick={() => { setCount(String(side.actualCount ?? '')); setCountDlg(true); }}>Enregistrer le comptage</Button>}
          </>
        } />
      <div className="grid-2" style={{ marginBottom: 16 }}>
        <Alert kind="neutral" title={`Votre service : ${borderPostName[c]} — contrôle ${isExit ? 'de sortie du ' : "d'entrée au "}${countryLabel[c]}`}>
          Le contrôle {isExit ? "d'entrée" : 'de sortie'} relève du service {other === 'TG' ? 'togolais' : 'béninois'} ({borderPostName[other]}). Aucun statut affiché ne vaut autorisation de passage : la décision appartient aux agents compétents.
        </Alert>
        {!ms.state ? (
          <Alert kind="warning" title="Manifeste non reçu par votre service.">Le contrôle classique reste disponible : contrôlez les voyageurs au guichet. Le comptage et la validation peuvent être enregistrés normalement.</Alert>
        ) : (
          <Alert kind="info" title="Manifeste reçu.">{ms.manifest?.reference} — {authorityLabel[countryAuthority[c]]} : <RecipientBadge s={ms.state} />. Les motifs de vérification sont consultables uniquement dans l'espace Police — Opérations.</Alert>
        )}
      </div>
      <div className="kpis">
        <Kpi label="Arrivée au poste" value={<span style={{ fontSize: 20 }}>{fmtTime(side.arrivedAt)}</span>} note={side.arrivedAt ? fmtDateTime(side.arrivedAt) : 'Non enregistrée'} />
        <Kpi label="Passagers attendus" value={expected} note={conventional ? `dont ${conventional} en contrôle classique` : 'selon la liste définitive'} />
        <Kpi label="Passagers comptés" value={side.actualCount ?? '—'} note={side.countRecordedAt ? `à ${fmtTime(side.countRecordedAt)}` : 'Comptage à enregistrer'} />
        <Kpi label="Écart" value={side.actualCount === null ? '—' : discrepancy ? side.actualCount - expected : 0} tone={discrepancy ? 'critical' : undefined} note={discrepancy ? 'Écart de comptage détecté' : side.actualCount !== null ? 'Aucun écart' : undefined} />
        <Kpi label="Contrôle de ce poste" value={<span style={{ fontSize: 16 }}>{locked ? 'Enregistré' : 'En cours'}</span>} note={locked ? `${userName(db, side.completedBy)} · ${fmtTime(side.completedAt)}` : undefined} />
      </div>
      {conventional > 0 && <><Alert kind="neutral" title={`${conventional} voyageur(s) non pré-inscrit(s)`}>Ils ne figurent pas au manifeste et passent par le contrôle classique au guichet.</Alert><div style={{ height: 16 }} /></>}
      <Panel title="Confirmation des passagers" flush hint="Statut de vérification visible sans motif. Confirmation visuelle : démonstration."
        actions={<FilterSelect label="Afficher" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Tous' }, { value: 'pending', label: 'À contrôler' }, { value: 'confirmed', label: 'Identité confirmée' }, { value: 'conventional', label: 'Contrôle classique' }, { value: 'discrepancy', label: 'Écart' }]} />}>
        <DataTable rows={shown} rowKey={(pt) => pt.id} caption="Passagers à confirmer" pageSize={25} empty={rows.length ? 'Aucun passager pour ce filtre.' : 'Aucun passager pré-inscrit à confirmer.'}
          columns={[
            { key: 'n', header: 'Passager', render: (pt) => { const p = passengerOf(db, pt); return <span><span className="strong">{fullName(p)}</span><br /><span className="small muted mono">{pt.ticketReference}</span></span>; } },
            { key: 'nat', header: 'Nationalité', render: (pt) => passengerOf(db, pt).nationality },
            { key: 'doc', header: 'Document', render: (pt) => { const p = passengerOf(db, pt); return <span>{docTypeLabel[p.documentType]}<br /><span className="small mono muted">{maskDocument(p.documentNumber)}</span></span>; } },
            { key: 'st', header: 'Statut police', render: (pt) => { const s = borderStatusView(db, user, pt.id); return s ? <PoliceStatusBadge s={s} /> : <span className="small muted">Non disponible</span>; } },
            { key: 'f', header: 'Visage', render: (pt) => (passengerOf(db, pt).face ? <span className="small"><Camera size={14} aria-hidden style={{ verticalAlign: -2 }} /> <SimTag>Démo</SimTag></span> : <span className="small muted">Aucune photo</span>) },
            { key: 'c', header: 'Contrôle', render: (pt) => { const v = side.checks[pt.id]; return v === 'confirmed' ? <StatusBadge tone="green">Identité confirmée</StatusBadge> : v === 'conventional' ? <StatusBadge tone="outline">Contrôle classique</StatusBadge> : v === 'discrepancy' ? <StatusBadge tone="red">Écart signalé</StatusBadge> : <StatusBadge tone="neutral">À contrôler</StatusBadge>; } },
            { key: 'a', header: 'Actions', render: (pt) => locked ? null : (
              <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                {side.checks[pt.id] ? (
                  <Button size="sm" variant="ghost" icon={<Undo2 size={14} aria-hidden />} onClick={() => run('chk', () => borderRecordPassengerCheck(user, t.id, pt.id, null), 'Votre modification a été enregistrée.')}>Annuler</Button>
                ) : (
                  <>
                    <Button size="sm" variant="success" icon={<UserCheck size={14} aria-hidden />} onClick={() => run('chk', () => borderRecordPassengerCheck(user, t.id, pt.id, 'confirmed'), 'Identité confirmée.')}>Confirmer</Button>
                    <Button size="sm" onClick={() => run('chk', () => borderRecordPassengerCheck(user, t.id, pt.id, 'conventional'), 'Passager orienté vers le contrôle classique.')}>Contrôle classique</Button>
                    <Button size="sm" variant="ghost" icon={<AlertTriangle size={14} aria-hidden />} onClick={() => run('chk', () => borderRecordPassengerCheck(user, t.id, pt.id, 'discrepancy'), 'Écart passager signalé.')}>Signaler un écart</Button>
                  </>
                )}
              </div>
            ) },
          ]} />
      </Panel>
      <div style={{ height: 16 }} />
      <Panel title="Enregistrer le contrôle">
        <div className="stack">
          <div className="grid-2">
            <div className="stack-sm">
              <strong>{borderPostName[exit]} — sortie du {countryLabel[exit]}</strong>
              {t.border[exit].completedAt ? <StatusBadge tone="green">Sortie validée à {fmtTime(t.border[exit].completedAt)}</StatusBadge> : c === exit ? (
                <Button variant="primary" icon={<LogOut size={18} aria-hidden />} disabled={side.actualCount === null} onClick={() => setConfirm(true)}>Valider la sortie</Button>
              ) : <Button disabled icon={<LogOut size={18} aria-hidden />} title="Relève du service compétent">Valider la sortie — service {exit === 'TG' ? 'togolais' : 'béninois'}</Button>}
            </div>
            <div className="stack-sm">
              <strong>{borderPostName[entry]} — entrée au {countryLabel[entry]}</strong>
              {t.border[entry].completedAt ? <StatusBadge tone="green">Entrée validée à {fmtTime(t.border[entry].completedAt)}</StatusBadge> : c === entry ? (
                <Button variant="primary" icon={<LogIn size={18} aria-hidden />} disabled={side.actualCount === null || exitPending} onClick={() => setConfirm(true)}>Valider l'entrée</Button>
              ) : <Button disabled icon={<LogIn size={18} aria-hidden />} title="Relève du service compétent">Valider l'entrée — service {entry === 'TG' ? 'togolais' : 'béninois'}</Button>}
            </div>
          </div>
          {!locked && side.actualCount === null && <p className="small muted">Enregistrez d'abord le comptage des passagers.</p>}
          {!locked && exitPending && <p className="small muted">Le contrôle d'entrée est enregistré après le contrôle de sortie du pays de départ.</p>}
        </div>
      </Panel>
      <Dialog open={countDlg} title="Enregistrer le comptage" onClose={() => setCountDlg(false)} description={`Passagers attendus : ${expected}.`}
        footer={<><Button onClick={() => setCountDlg(false)}>Annuler</Button><Button variant="primary" loading={busy === 'count'} disabled={count === '' || !Number.isInteger(Number(count)) || Number(count) < 0} onClick={async () => { await run('count', () => borderRecordCount(user, t.id, Number(count)), Number(count) !== expected ? 'Écart de comptage détecté et enregistré.' : 'Comptage enregistré.'); setCountDlg(false); }}>Enregistrer</Button></>}>
        <TextField label="Nombre de passagers comptés à bord" type="number" min={0} value={count} onChange={(e) => setCount(e.target.value)} error={count !== '' && (!Number.isInteger(Number(count)) || Number(count) < 0) ? 'Saisissez un nombre valide.' : null} autoFocus />
        {count !== '' && Number(count) !== expected && <Alert kind="warning">Écart de {Number(count) - expected} par rapport à la liste définitive.</Alert>}
      </Dialog>
      <ConfirmationDialog open={confirm} title={isExit ? 'Valider la sortie ?' : "Valider l'entrée ?"} confirmLabel={isExit ? 'Valider la sortie' : "Valider l'entrée"} loading={busy === 'done'}
        message="Vous enregistrez la réalisation du contrôle de votre service. Cette décision vous appartient ; la plateforme n'autorise aucun passage automatiquement."
        onClose={() => setConfirm(false)} onConfirm={async () => { await run('done', () => borderCompleteControl(user, t.id), 'Votre modification a été enregistrée.'); setConfirm(false); }}>
        {rows.some((pt) => !side.checks[pt.id]) && <Alert kind="warning">{rows.filter((pt) => !side.checks[pt.id]).length} passager(s) sans contrôle enregistré.</Alert>}
        {discrepancy && <Alert kind="warning">Un écart de comptage est enregistré.</Alert>}
      </ConfirmationDialog>
    </>
  );
}

// ------------------------------------------------ contrôle d'un passager (billet)

export function BorderPassengerCheck() {
  const { user, db, c } = useBorderContext();
  const [params, setParams] = useSearchParams();
  const [v, setV] = useState(params.get('ref') ?? '');
  const ref = params.get('ref');
  const pt = ref ? db.passengerTrips.find((x) => x.ticketReference === parseTicketInput(ref)) : undefined;
  const trip = pt ? corridorTrips(db, user).find((t) => t.id === pt.tripId) : undefined;
  const p = pt && trip ? passengerOf(db, pt) : undefined;
  const status = pt ? borderStatusView(db, user, pt.id) : null;
  return (
    <>
      <PageTitle title="Contrôle des passagers" lead="Identifiez un voyageur à partir de son billet (QR code ou référence)." />
      <Panel>
        <form className="row" style={{ alignItems: 'flex-end', flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); setParams(v.trim() ? { ref: parseTicketInput(v) } : {}); }}>
          <div style={{ flex: 1 }}><TextField label="Référence du billet ou contenu du QR code" value={v} onChange={(e) => setV(e.target.value)} placeholder="TKT-…" className="mono" /></div>
          <Button type="submit" variant="primary" icon={<ScanSearch size={18} aria-hidden />}>Rechercher</Button>
        </form>
      </Panel>
      <div style={{ height: 16 }} />
      {ref && (!p || !trip ? (
        <Alert kind="warning" title="Billet non trouvé ou non transmis.">Aucun dossier pré-inscrit visible pour « {ref} ». Le contrôle classique reste disponible.</Alert>
      ) : (
        <Panel title={fullName(p)} hint={<span className="mono">{pt!.ticketReference}</span>} actions={<Link className="btn btn-primary" to={`/border/trips/${trip.id}`}>Ouvrir le contrôle du bus</Link>}>
          <dl className="dl">
            <dt>Voyage</dt><dd className="mono">{trip.reference} · {busById(db, trip.busId)?.registration}</dd>
            <dt>Sens</dt><dd><DirectionLabel d={trip.direction} /></dd>
            <dt>Nationalité</dt><dd>{p.nationality || '—'}</dd>
            <dt>Document</dt><dd>{pt!.preRegistered ? `${docTypeLabel[p.documentType]} · ${maskDocument(p.documentNumber)}` : 'Non pré-inscrit — contrôle classique'}</dd>
            <dt>Statut police</dt><dd>{status ? <PoliceStatusBadge s={status} /> : 'Non disponible'}</dd>
            <dt>Contrôle à ce poste</dt><dd>{trip.border[c].checks[pt!.id] ?? 'Non enregistré'}</dd>
          </dl>
        </Panel>
      ))}
    </>
  );
}

export function BorderDiscrepancies() {
  const { user, db, c } = useBorderContext();
  const rows = corridorTrips(db, user).flatMap((t) => {
    const s = sideOf(t, c);
    const out: { id: string; t: Trip; kind: string; detail: string; at: string | null }[] = [];
    const exp = expectedOnBoard(db, t);
    if (s.actualCount !== null && s.actualCount !== exp) out.push({ id: `${t.id}-count`, t, kind: 'Écart de comptage', detail: `${s.actualCount} compté(s) pour ${exp} attendu(s)`, at: s.countRecordedAt });
    for (const [ptId, v] of Object.entries(s.checks)) if (v === 'discrepancy') {
      const pt = db.passengerTrips.find((x) => x.id === ptId)!;
      out.push({ id: `${t.id}-${ptId}`, t, kind: 'Écart passager', detail: `${fullName(passengerOf(db, pt))} · ${pt.ticketReference}`, at: null });
    }
    return out;
  });
  return (
    <>
      <PageTitle title="Écarts" lead={`Écarts de comptage et écarts passagers enregistrés au ${borderPostName[c]}.`} />
      <Panel flush>
        <DataTable rows={rows} rowKey={(r) => r.id} caption="Écarts enregistrés" empty="Aucun écart enregistré."
          columns={[
            { key: 't', header: 'Voyage', render: (r) => <Link className="mono" to={`/border/trips/${r.t.id}`}>{r.t.reference}</Link> },
            { key: 'b', header: 'Immatriculation', render: (r) => <span className="mono">{busById(db, r.t.busId)?.registration}</span> },
            { key: 'k', header: 'Type', render: (r) => <StatusBadge tone="orange" icon={<AlertTriangle size={14} aria-hidden />}>{r.kind}</StatusBadge> },
            { key: 'd', header: 'Détail', render: (r) => r.detail },
            { key: 'h', header: 'Enregistré', render: (r) => <span className="mono">{fmtDateTime(r.at)}</span> },
          ]} />
      </Panel>
    </>
  );
}

export function BorderHistory() {
  const { user, db, c } = useBorderContext();
  const rows = corridorTrips(db, user).filter((t) => sideOf(t, c).completedAt).sort((a, b) => sideOf(b, c).completedAt!.localeCompare(sideOf(a, c).completedAt!));
  return (
    <>
      <PageTitle title="Historique du poste" lead={`Contrôles enregistrés au ${borderPostName[c]}.`} />
      <Panel flush>
        <DataTable rows={rows} rowKey={(t) => t.id} caption="Historique des contrôles" empty="Aucun contrôle enregistré."
          columns={[
            { key: 'r', header: 'Voyage', render: (t) => <Link className="mono" to={`/border/trips/${t.id}`}>{t.reference}</Link> },
            { key: 'b', header: 'Immatriculation', render: (t) => <span className="mono">{busById(db, t.busId)?.registration}</span> },
            { key: 'd', header: 'Sens', render: (t) => <DirectionLabel d={t.direction} /> },
            { key: 'v', header: 'Contrôle', render: (t) => (exitEntry(t.direction).exit === c ? 'Sortie' : 'Entrée') },
            { key: 'a', header: 'Arrivée', render: (t) => <span className="mono">{fmtDateTime(sideOf(t, c).arrivedAt)}</span> },
            { key: 'f', header: 'Contrôle enregistré', render: (t) => <span className="mono">{fmtDateTime(sideOf(t, c).completedAt)}</span> },
            { key: 'n', header: 'Comptage', render: (t) => `${sideOf(t, c).actualCount ?? '—'} / ${expectedOnBoard(db, t)}`, className: 'num' },
            { key: 'u', header: 'Agent', render: (t) => userName(db, sideOf(t, c).completedBy) },
          ]} />
      </Panel>
    </>
  );
}
