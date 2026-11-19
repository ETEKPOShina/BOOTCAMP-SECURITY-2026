import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ScanLine, CheckCircle2, UserX, AlertTriangle, Lock, PlayCircle, RotateCcw, Camera } from 'lucide-react';
import { useUser } from '../../auth/AuthContext';
import { useDb } from '../../data/store';
import { can } from '../../domain/permissions';
import { fullName } from '../../domain/passenger';
import { fmtDateTime, fmtTime } from '../../lib/dates';
import { activePts, busById, latestManifest, passengerOf } from '../../services/queries';
import { boardByTicket, closeBoarding, openBoarding, setBoardingStatus, setFaceDemo, prepareProvisionalManifest, type BoardResult } from '../../services/api';
import { useAction } from '../../hooks/useAction';
import { useAgencyTrip, TripNotFound } from './TripDetail';
import { DataTable } from '../../components/DataTable';
import { BoardingBadge, TripStatusBadge, DirectionLabel } from '../../components/status';
import { ConfirmationDialog } from '../../components/Dialog';
import { Alert, Button, FilterBar, FilterSelect, Kpi, PageTitle, Panel, SearchField, SimTag } from '../../components/ui';
import { boardingLabel } from '../../domain/labels';

export function Boarding() {
  const trip = useAgencyTrip();
  const user = useUser();
  const db = useDb();
  const { run, busy } = useAction();
  const [scan, setScan] = useState('');
  const [result, setResult] = useState<BoardResult | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const inputRef = useRef<HTMLInputElement>(null);
  const pts = useMemo(() => (trip ? activePts(db, trip.id) : []), [trip, db]);
  const rows = useMemo(() => pts.filter((pt) => {
    const p = passengerOf(db, pt);
    const s = q.trim().toLowerCase();
    return (!s || `${p.lastName} ${p.firstName} ${pt.ticketReference}`.toLowerCase().includes(s)) && (filter === 'all' || pt.boardingStatus === filter);
  }), [pts, q, filter, db]);
  if (!trip) return <TripNotFound />;
  if (!can(user, 'agency.boarding.operate')) return <Alert kind="error">Cette action nécessite une habilitation spécifique.</Alert>;
  const bus = busById(db, trip.busId);
  const boarded = pts.filter((p) => p.boardingStatus === 'boarded').length;
  const absent = pts.filter((p) => p.boardingStatus === 'absent').length;
  const review = pts.filter((p) => p.boardingStatus === 'manual_review').length;
  const pct = pts.length ? Math.round((boarded / pts.length) * 100) : 0;
  const open = trip.status === 'boarding';
  const hasProvisional = db.manifests.some((m) => m.tripId === trip.id && m.type === 'provisional');

  const onScan = async (e: FormEvent) => {
    e.preventDefault();
    if (!scan.trim()) { setResult({ ok: false, reason: 'not_found', message: 'Ce champ est obligatoire.' }); return; }
    const r = await run('scan', () => boardByTicket(user, trip.id, scan));
    if (r) setResult(r);
    setScan('');
    inputRef.current?.focus();
  };

  return (
    <>
      <PageTitle
        title="Embarquement des passagers"
        lead="Scannez le billet de chaque voyageur et confirmez sa présence à bord."
        crumbs={[{ label: 'Voyages', to: '/agency/trips' }, { label: trip.reference, to: `/agency/trips/${trip.id}` }, { label: 'Embarquement' }]}
        badge={<TripStatusBadge s={trip.status} />}
        actions={
          <>
            {['planned', 'preparing'].includes(trip.status) && <Button variant="primary" icon={<PlayCircle size={18} aria-hidden />} loading={busy === 'open'} onClick={() => run('open', () => openBoarding(user, trip.id), "Embarquement ouvert.")}>Ouvrir l'embarquement</Button>}
            {open && <Button variant="primary" icon={<Lock size={18} aria-hidden />} onClick={() => setConfirmClose(true)}>Clôturer l'embarquement</Button>}
            {!open && trip.status === 'boarding_closed' && <Link className="btn btn-primary" to={`/agency/trips/${trip.id}/manifest`}>Transmettre la liste définitive</Link>}
          </>
        }
      />
      <div className="kpis">
        <Kpi label="Référence" value={<span style={{ fontSize: 16 }} className="mono">{trip.reference}</span>} note={<DirectionLabel d={trip.direction} />} />
        <Kpi label="Bus" value={<span style={{ fontSize: 18 }} className="mono">{bus?.registration}</span>} note={`Départ prévu ${fmtTime(trip.scheduledDeparture)}`} />
        <Kpi label="Passagers attendus" value={pts.length} />
        <Kpi label="Embarqués" value={boarded} />
        <Kpi label="Absents" value={absent} />
        <Kpi label="Vérification manuelle" value={review} tone={review ? 'attention' : undefined} />
      </div>
      <Panel>
        <div className="stack-sm">
          <div className="row" style={{ justifyContent: 'space-between' }}><span className="strong">Progression de l'embarquement</span><span className="mono">{boarded} / {pts.length} · {pct} %</span></div>
          <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progression de l'embarquement"><span style={{ width: `${pct}%` }} /></div>
        </div>
      </Panel>
      <div style={{ height: 16 }} />
      {!open && ['planned', 'preparing'].includes(trip.status) && (
        <Alert kind="info" title="L'embarquement n'est pas encore ouvert." action={!hasProvisional && can(user, 'agency.manifest.prepare') ? <Button size="sm" onClick={() => run('prov', () => prepareProvisionalManifest(user, trip.id), 'Manifeste provisoire préparé.')}>Préparer la liste provisoire</Button> : undefined}>
          Ouvrez l'embarquement pour scanner les billets. {!hasProvisional && 'La liste provisoire n’a pas encore été préparée.'}
        </Alert>
      )}
      {trip.status === 'boarding_closed' && <Alert kind="success" title="Embarquement clôturé.">La liste définitive a été préparée ({latestManifest(db, trip.id)?.reference}). Transmettez-la aux services concernés.</Alert>}
      {open && (
        <Panel title="Scanner ou saisir un billet">
          <form onSubmit={onScan} className="stack-sm">
            <label htmlFor="scan" className="label strong">Référence du billet ou contenu du QR code</label>
            <div className="row">
              <input id="scan" ref={inputRef} style={{ flex: '1 1 200px', minWidth: 0, width: '100%' }} className="input input-lg mono" value={scan} onChange={(e) => setScan(e.target.value)} placeholder="TKT-…" autoComplete="off" autoFocus aria-describedby="scan-help" />
              <Button type="submit" variant="primary" size="lg" icon={<ScanLine size={20} aria-hidden />} loading={busy === 'scan'}>Confirmer l'embarquement</Button>
            </div>
            <span id="scan-help" className="help small muted">Compatible avec un lecteur de codes fonctionnant comme un clavier. Aucune caméra de lecture n'est connectée.</span>
            <div aria-live="assertive">
              {result && (result.ok ? (
                <Alert kind="success" title={`Embarqué : ${result.name}`}>{result.conventional ? 'Voyageur non pré-inscrit : il passera par le contrôle classique au poste frontalier.' : 'Présence à bord confirmée.'}</Alert>
              ) : (
                <Alert kind={result.reason === 'already' ? 'warning' : 'error'} title={result.reason === 'already' ? 'Double embarquement détecté' : 'Billet non accepté'}>{result.message}{result.name && <> — {result.name}</>}</Alert>
              ))}
            </div>
          </form>
        </Panel>
      )}
      <div style={{ height: 16 }} />
      <Panel title="Passagers" flush>
        <FilterBar>
          <SearchField label="Rechercher un passager" value={q} onChange={setQ} placeholder="Nom ou billet…" />
          <FilterSelect label="Statut" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Tous' }, ...Object.entries(boardingLabel).map(([value, label]) => ({ value, label }))]} />
        </FilterBar>
        <DataTable
          rows={rows} rowKey={(pt) => pt.id} caption="Statut d'embarquement des passagers" empty="Aucun passager pour ce filtre." pageSize={25}
          columns={[
            { key: 'n', header: 'Passager', render: (pt) => <span>{fullName(passengerOf(db, pt))}{!pt.preRegistered && <><br /><span className="small muted">Contrôle classique</span></>}</span> },
            { key: 't', header: 'Billet', render: (pt) => <span className="mono">{pt.ticketReference}</span> },
            { key: 's', header: "Statut", render: (pt) => <BoardingBadge s={pt.boardingStatus} /> },
            { key: 'h', header: 'Heure', render: (pt) => <span className="mono">{fmtTime(pt.boardingTimestamp)}</span> },
            { key: 'f', header: 'Confirmation visuelle', render: (pt) => !pt.preRegistered ? <span className="small muted">Sans objet</span> : pt.faceConfirmDemo === 'match_demo' ? <span className="small"><SimTag>Démo</SimTag> concordance simulée</span> : pt.faceConfirmDemo === 'manual' ? <span className="small">Vérifiée par l'agent</span> : open ? <Button size="sm" variant="ghost" icon={<Camera size={14} aria-hidden />} onClick={() => run('face', () => setFaceDemo(user, pt.id, 'match_demo'), 'Confirmation visuelle simulée enregistrée.')}>Simuler</Button> : '—' },
            { key: 'a', header: 'Actions', render: (pt) => open ? (
              <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                {pt.boardingStatus !== 'boarded' && <Button size="sm" variant="success" icon={<CheckCircle2 size={14} aria-hidden />} onClick={() => run('b', () => setBoardingStatus(user, pt.id, 'boarded'), "Embarquement confirmé.")}>Embarqué</Button>}
                {pt.boardingStatus !== 'absent' && <Button size="sm" icon={<UserX size={14} aria-hidden />} onClick={() => run('a', () => setBoardingStatus(user, pt.id, 'absent'), 'Absence signalée.')}>Signaler une absence</Button>}
                {pt.boardingStatus !== 'manual_review' && <Button size="sm" variant="ghost" icon={<AlertTriangle size={14} aria-hidden />} onClick={() => run('m', () => setBoardingStatus(user, pt.id, 'manual_review'), 'Vérification manuelle demandée.')}>Vérification</Button>}
                {pt.boardingStatus !== 'pending' && <Button size="sm" variant="ghost" icon={<RotateCcw size={14} aria-hidden />} aria-label="Réinitialiser le statut" onClick={() => run('r', () => setBoardingStatus(user, pt.id, 'pending'), 'Statut réinitialisé.')} />}
              </div>
            ) : <span className="small muted">{fmtDateTime(pt.boardingTimestamp)}</span> },
          ]}
        />
      </Panel>
      <ConfirmationDialog
        open={confirmClose} title="Clôturer l'embarquement ?" confirmLabel="Clôturer l'embarquement" loading={busy === 'close'}
        message="Clôturer l'embarquement ? La liste définitive des passagers sera préparée pour transmission aux services concernés."
        onClose={() => setConfirmClose(false)}
        onConfirm={async () => { await run('close', () => closeBoarding(user, trip.id), 'Embarquement clôturé.'); setConfirmClose(false); }}
      >
        {pts.some((p) => p.boardingStatus === 'pending') && <Alert kind="warning">{pts.filter((p) => p.boardingStatus === 'pending').length} passager(s) non scanné(s) seront marqués absents.</Alert>}
        {review > 0 && <Alert kind="warning">{review} passager(s) en vérification manuelle ne figureront pas sur la liste définitive.</Alert>}
      </ConfirmationDialog>
    </>
  );
}
