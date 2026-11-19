import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Home, Route as RouteIcon, ListOrdered, User as UserIcon, Map, PlayCircle, Flag, AlertTriangle, CheckCircle2, LogOut, MapPin, ShieldCheck, ArrowRight } from 'lucide-react';
import { useAuth, useUser } from '../../auth/AuthContext';
import { useDb } from '../../data/store';
import { directionLabel, eventTypeLabel, tripStatusLabel } from '../../domain/labels';
import { driverDocuments } from '../../domain/documents';
import { fmtDate, fmtDateTime, fmtTime, nowIso, relative } from '../../lib/dates';
import { uid } from '../../lib/ids';
import { useNetwork, setSimulatedOffline } from '../../lib/network';
import { activePts, busById, driverById, manifestsOfTrip, tripEvents } from '../../services/queries';
import { recordDriverEvent } from '../../services/api';
import { enqueue, flushQueue, useQueue } from '../../services/driverQueue';
import { useToast } from '../../components/Toast';
import { DirectionLabel, DocBadge, NetworkBadge, TripStatusBadge } from '../../components/status';
import { RouteProgress, TripProgress } from '../../components/domain';
import { ConfirmationDialog } from '../../components/Dialog';
import { Alert, Button, SelectField, TextAreaField } from '../../components/ui';
import { DemoBar } from '../../layouts/AppShell';
import type { Trip, TripEventType } from '../../domain/types';

function useDriverTrip() {
  const user = useUser();
  const db = useDb();
  const mine = db.trips.filter((t) => t.driverId === user.driverId && t.status !== 'cancelled').sort((a, b) => a.scheduledDeparture.localeCompare(b.scheduledDeparture));
  const active = mine.find((t) => ['boarding_closed', 'en_route', 'approaching_border', 'at_border'].includes(t.status))
    ?? mine.find((t) => ['planned', 'preparing', 'boarding'].includes(t.status));
  const last = [...mine].reverse().find((t) => t.status === 'arrived');
  return { trip: active, last, all: mine };
}

/** Enregistre un événement ; hors ligne, il est placé en file locale puis synchronisé. */
function useRecorder() {
  const user = useUser();
  const net = useNetwork();
  const toast = useToast();
  return (trip: Trip, type: TripEventType, locationLabel = '', note = '') => {
    const e = { tripId: trip.id, type, locationLabel, note, clientEventId: uid('ce'), timestamp: nowIso() };
    if (net.offline) {
      enqueue({ ...e, userId: user.id, queuedAt: nowIso() });
      toast('Hors ligne : événement enregistré sur l’appareil. Les données seront synchronisées lorsque la connexion sera rétablie.');
      return;
    }
    try {
      recordDriverEvent(user, e);
      toast(`${eventTypeLabel[type]} — enregistré.`);
    } catch {
      enqueue({ ...e, userId: user.id, queuedAt: nowIso() });
      toast('Envoi impossible : événement conservé pour synchronisation.', 'error');
    }
  };
}

function DriverShell({ children }: { children: ReactNode }) {
  const user = useUser();
  const net = useNetwork();
  const queue = useQueue(user.id);
  const toast = useToast();
  const flushing = useRef(false);
  useEffect(() => {
    if (!net.offline && queue.length && !flushing.current) {
      flushing.current = true;
      const r = flushQueue(user);
      flushing.current = false;
      if (r.synced) toast(`Synchronisé : ${r.synced} événement(s) envoyé(s).`);
    }
  }, [net.offline, queue.length, user, toast]);
  const items = [
    { to: '/driver/home', label: 'Accueil', icon: <Home size={22} aria-hidden /> },
    { to: '/driver/trip', label: 'Voyage', icon: <RouteIcon size={22} aria-hidden /> },
    { to: '/driver/route', label: 'Itinéraire', icon: <Map size={22} aria-hidden /> },
    { to: '/driver/events', label: 'Événements', icon: <ListOrdered size={22} aria-hidden /> },
    { to: '/driver/profile', label: 'Profil', icon: <UserIcon size={22} aria-hidden /> },
  ];
  return (
    <>
      <a href="#contenu" className="skip-link">Aller au contenu principal</a>
      <DemoBar />
      <div className="drv">
        <header className="drv-top">
          <img src={`${import.meta.env.BASE_URL}brand/wezonpass-symbole-couleur.png`} alt="WeZonPass" width={42} height={30} />
          <div style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
            <div className="strong" style={{ fontSize: 14 }}>Espace chauffeur</div>
            <div className="small muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
          </div>
          <NetworkBadge offline={net.offline} pending={queue.length} />
        </header>
        {net.offline && <div style={{ padding: '8px 12px 0' }}><Alert kind="warning" title="Hors ligne">Les événements sont conservés sur l'appareil et seront synchronisés au retour de la connexion.</Alert></div>}
        <main className="drv-main" id="contenu">{children}</main>
        <nav className="drv-nav" aria-label="Navigation chauffeur">
          {items.map((i) => <NavLink key={i.to} to={i.to} className={({ isActive }) => (isActive ? 'active' : '')}>{i.icon}{i.label}</NavLink>)}
        </nav>
      </div>
    </>
  );
}

function effectiveDone(tripId: string, synced: string[], queued: { tripId: string; type: string }[]) {
  return new Set([...synced, ...queued.filter((q) => q.tripId === tripId).map((q) => q.type)]);
}

function NoTrip() {
  return <div className="drv-card"><div className="drv-big">Aucun voyage assigné</div><p className="muted" style={{ marginTop: 6 }}>Votre agence vous affectera un voyage. Vous recevrez une notification.</p></div>;
}

export function DriverHome() {
  const user = useUser();
  const db = useDb();
  const { trip, last } = useDriverTrip();
  const queue = useQueue(user.id);
  const record = useRecorder();
  const nav = useNavigate();
  const [confirm, setConfirm] = useState<null | TripEventType>(null);
  useEffect(() => { document.title = 'Espace chauffeur — WeZonPass'; }, []);
  const driver = user.driverId ? driverById(db, user.driverId) : undefined;
  if (!trip) return <DriverShell><h1 className="sr-only">Accueil chauffeur</h1><div className="drv-card"><div className="small muted">Chauffeur</div><div className="drv-big">{driver?.name ?? user.name}</div></div><NoTrip />{last && <div className="drv-card"><div className="small muted">Dernier voyage</div><div className="strong mono">{last.reference}</div><div className="small">Arrivé à {last.destination} le {fmtDateTime(last.actualArrival)}</div></div>}</DriverShell>;
  const bus = busById(db, trip.busId);
  const pts = activePts(db, trip.id);
  const boarded = pts.filter((p) => p.boardingStatus === 'boarded').length;
  const done = effectiveDone(trip.id, tripEvents(db, trip.id).map((e) => e.eventType), queue);
  const departed = done.has('departure');
  const atBorder = done.has('border_arrival') || trip.status === 'at_border';
  const arrived = done.has('destination_arrival');
  const finalSent = manifestsOfTrip(db, trip.id).some((m) => m.type === 'final' && m.recipients.some((r) => ['received', 'verifying', 'processed'].includes(r.state)));
  const messages: Partial<Record<TripEventType, string>> = {
    departure: finalSent ? 'Confirmez-vous le départ du bus maintenant ?' : 'La liste définitive n’a pas été reçue par les services de police. Le départ reste possible : le contrôle classique reste disponible à la frontière.',
    border_arrival: 'Confirmez-vous l’arrivée du bus au poste frontalier ?',
    destination_arrival: atBorder || done.has('border_departure') ? 'Confirmez-vous l’arrivée à destination ?' : 'Le passage de la frontière n’a pas été enregistré. Confirmer quand même l’arrivée à destination ?',
  };
  return (
    <DriverShell>
      <h1 className="sr-only">Accueil chauffeur</h1>
      <div className="drv-card stack-sm">
        <div className="small muted">Bonjour</div>
        <div className="drv-big">{driver?.name ?? user.name}</div>
        <div className="row"><span className="small muted">Bus assigné</span><span className="mono strong">{bus?.registration}</span></div>
      </div>
      <section className="drv-card stack-sm" aria-label="Voyage en cours">
        <div className="row" style={{ justifyContent: 'space-between' }}><span className="small muted">Voyage en cours</span><TripStatusBadge s={trip.status} /></div>
        <div className="mono strong">{trip.reference}</div>
        <div className="drv-big row" style={{ gap: 8 }}>{trip.departure} <ArrowRight size={20} aria-hidden /> {trip.destination}</div>
        <DirectionLabel d={trip.direction} />
        <dl className="dl" style={{ marginTop: 6 }}>
          <dt>Départ prévu</dt><dd>{fmtDate(trip.scheduledDeparture)} à {fmtTime(trip.scheduledDeparture)}</dd>
          <dt>Passagers</dt><dd>{boarded} à bord · {pts.length} inscrit(s)</dd>
          <dt>Étape</dt><dd>{tripStatusLabel[trip.status]}{queue.some((q) => q.tripId === trip.id) && ' (mise à jour en attente)'}</dd>
        </dl>
        <TripProgress trip={trip} />
      </section>
      <div className="drv-actions">
        <Button variant="primary" icon={<PlayCircle size={24} aria-hidden />} disabled={departed} onClick={() => setConfirm('departure')}>{departed ? 'Départ confirmé' : 'Confirmer le départ'}</Button>
        <Button variant={departed && !atBorder ? 'primary' : 'secondary'} icon={<ShieldCheck size={24} aria-hidden />} disabled={!departed || atBorder || arrived} onClick={() => setConfirm('border_arrival')}>{atBorder ? 'Arrivée à la frontière signalée' : "Signaler l'arrivée à la frontière"}</Button>
        <Button icon={<AlertTriangle size={24} aria-hidden />} onClick={() => nav('/driver/incident')} disabled={arrived}>Signaler un incident</Button>
        <Button variant={atBorder && !arrived ? 'primary' : 'secondary'} icon={<Flag size={24} aria-hidden />} disabled={!departed || arrived} onClick={() => setConfirm('destination_arrival')}>{arrived ? 'Arrivée confirmée' : "Confirmer l'arrivée"}</Button>
      </div>
      {!departed && <p className="small muted">Le départ ne peut jamais être bloqué par une erreur logicielle ou l'absence de réseau.</p>}
      <ConfirmationDialog open={!!confirm} title={confirm ? eventTypeLabel[confirm] : ''} confirmLabel="Confirmer" message={confirm ? messages[confirm] : ''}
        onClose={() => setConfirm(null)} onConfirm={() => { if (confirm) record(trip, confirm, confirm === 'departure' ? trip.departure : confirm === 'destination_arrival' ? trip.destination : 'Frontière Sanvee-Condji / Hillacondji'); setConfirm(null); }} />
    </DriverShell>
  );
}

export function DriverTrip() {
  const user = useUser();
  const db = useDb();
  const { trip } = useDriverTrip();
  const queue = useQueue(user.id);
  if (!trip) return <DriverShell><NoTrip /></DriverShell>;
  const bus = busById(db, trip.busId);
  const pts = activePts(db, trip.id);
  const evs = tripEvents(db, trip.id);
  const lastSync = evs.length ? evs[evs.length - 1].timestamp : null;
  return (
    <DriverShell>
      <h1 style={{ fontSize: 23 }}>Mon voyage</h1>
      <div className="drv-card">
        <dl className="dl">
          <dt>Référence</dt><dd className="mono">{trip.reference}</dd>
          <dt>Bus</dt><dd className="mono">{bus?.registration}</dd>
          <dt>Trajet</dt><dd>{trip.departure} → {trip.destination} ({directionLabel[trip.direction]})</dd>
          <dt>Arrêts autorisés</dt><dd>{trip.stops.join(', ') || 'Aucun'}</dd>
          <dt>Passagers</dt><dd>{pts.filter((p) => p.boardingStatus === 'boarded').length} à bord / {pts.length} inscrits</dd>
          <dt>Dernière synchronisation</dt><dd>{lastSync ? relative(lastSync) : '—'}{queue.length ? ` · ${queue.length} en attente` : ''}</dd>
        </dl>
      </div>
      <div className="drv-card"><TripProgress trip={trip} /></div>
      <div className="drv-card"><h2 className="sub" style={{ marginBottom: 8 }}>Chronologie</h2><DriverTimeline trip={trip} /></div>
    </DriverShell>
  );
}

function DriverTimeline({ trip }: { trip: Trip }) {
  const user = useUser();
  const db = useDb();
  const queue = useQueue(user.id).filter((q) => q.tripId === trip.id);
  const items = [
    ...tripEvents(db, trip.id).map((e) => ({ id: e.id, type: e.eventType, at: e.timestamp, loc: e.locationLabel, note: e.note, pending: false })),
    ...queue.map((q) => ({ id: q.clientEventId, type: q.type, at: q.timestamp, loc: q.locationLabel, note: q.note, pending: true })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  if (!items.length) return <p className="muted">Aucun événement.</p>;
  return (
    <ol className="timeline">
      {items.map((e) => (
        <li key={e.id}>
          <span className={`tl-dot ${e.type === 'incident' ? 'warn' : ''} ${e.pending ? 'pending' : ''}`} aria-hidden />
          <div className="tl-title">{eventTypeLabel[e.type]}</div>
          <div className="tl-meta">{fmtTime(e.at)}{e.loc && ` · ${e.loc}`}{e.pending && ' · Synchronisation en attente'}</div>
          {e.note && <div className="small">{e.note}</div>}
        </li>
      ))}
    </ol>
  );
}

export function DriverRoute() {
  const user = useUser();
  const db = useDb();
  const { trip } = useDriverTrip();
  const queue = useQueue(user.id);
  const record = useRecorder();
  const [confirm, setConfirm] = useState<null | { type: TripEventType; loc: string }>(null);
  if (!trip) return <DriverShell><NoTrip /></DriverShell>;
  const done = effectiveDone(trip.id, tripEvents(db, trip.id).map((e) => e.eventType), queue);
  const stopsDone = new Set([...tripEvents(db, trip.id).filter((e) => e.eventType === 'stop_arrival').map((e) => e.locationLabel), ...queue.filter((q) => q.tripId === trip.id && q.type === 'stop_arrival').map((q) => q.locationLabel)]);
  const departed = done.has('departure');
  const steps: { type: TripEventType; label: string; loc: string; enabled: boolean; done: boolean }[] = [
    { type: 'boarding_confirmed_driver', label: "Confirmer la fin d'embarquement", loc: trip.departure, enabled: !departed, done: done.has('boarding_confirmed_driver') },
    { type: 'departure', label: 'Confirmer le départ', loc: trip.departure, enabled: true, done: departed },
    ...trip.stops.map((s) => ({ type: 'stop_arrival' as TripEventType, label: `Arrêt autorisé : ${s}`, loc: s, enabled: departed, done: stopsDone.has(s) })),
    { type: 'approaching_border', label: "Signaler l'approche de la frontière", loc: trip.direction === 'TG-BJ' ? 'Aného' : 'Grand-Popo', enabled: departed, done: done.has('approaching_border') },
    { type: 'border_arrival', label: "Signaler l'arrivée à la frontière", loc: 'Frontière Sanvee-Condji / Hillacondji', enabled: departed, done: done.has('border_arrival') },
    { type: 'border_departure', label: 'Départ du poste frontalier', loc: 'Frontière Sanvee-Condji / Hillacondji', enabled: done.has('border_arrival') || trip.status === 'at_border', done: done.has('border_departure') },
    { type: 'destination_arrival', label: "Confirmer l'arrivée", loc: trip.destination, enabled: departed, done: done.has('destination_arrival') },
  ];
  return (
    <DriverShell>
      <h1 style={{ fontSize: 23 }}>Itinéraire</h1>
      <div className="drv-card"><RouteProgress trip={trip} /></div>
      <div className="drv-actions">
        {steps.map((s, i) => (
          <Button key={`${s.type}-${i}`} variant={s.done ? 'secondary' : 'primary'} disabled={s.done || !s.enabled} icon={s.done ? <CheckCircle2 size={22} aria-hidden /> : <MapPin size={22} aria-hidden />} onClick={() => setConfirm({ type: s.type, loc: s.loc })}>
            {s.label}{s.done && ' — fait'}
          </Button>
        ))}
      </div>
      <ConfirmationDialog open={!!confirm} title={confirm ? eventTypeLabel[confirm.type] : ''} confirmLabel="Enregistrer" message={confirm ? `Lieu : ${confirm.loc}. Heure : ${fmtTime(nowIso())}.` : ''}
        onClose={() => setConfirm(null)} onConfirm={() => { if (confirm) record(trip, confirm.type, confirm.loc); setConfirm(null); }} />
    </DriverShell>
  );
}

export function DriverEvents() {
  const { trip, all } = useDriverTrip();
  const db = useDb();
  const [sel, setSel] = useState(trip?.id ?? all[all.length - 1]?.id ?? '');
  const t = all.find((x) => x.id === sel);
  return (
    <DriverShell>
      <h1 style={{ fontSize: 23 }}>Événements</h1>
      {all.length > 0 && <SelectField label="Voyage" value={sel} onChange={(e) => setSel(e.target.value)}>{all.map((x) => <option key={x.id} value={x.id}>{x.reference} · {fmtDate(x.scheduledDeparture)}</option>)}</SelectField>}
      {t ? <div className="drv-card"><DriverTimeline trip={t} /></div> : <NoTrip />}
      {t && <p className="small muted">{tripEvents(db, t.id).length} événement(s) synchronisé(s).</p>}
    </DriverShell>
  );
}

const INCIDENT_TYPES = ['Panne mécanique', 'Accident', 'Ralentissement / embouteillage', 'Problème de santé à bord', 'Contrôle routier', 'Autre'];

export function DriverIncident() {
  const { trip } = useDriverTrip();
  const record = useRecorder();
  const nav = useNavigate();
  const [type, setType] = useState('');
  const [loc, setLoc] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const locations = useMemo(() => (trip ? [trip.departure, ...['Aného', 'Frontière Sanvee-Condji / Hillacondji', 'Grand-Popo', 'Comè', 'Ouidah'], trip.destination] : []), [trip]);
  if (!trip) return <DriverShell><NoTrip /></DriverShell>;
  return (
    <DriverShell>
      <h1 style={{ fontSize: 23 }}>Signaler un incident</h1>
      <form className="drv-card stack" noValidate onSubmit={(e) => {
        e.preventDefault();
        const er: Record<string, string> = {};
        if (!type) er.type = 'Ce champ est obligatoire.';
        if (!loc) er.loc = 'Ce champ est obligatoire.';
        setErrors(er);
        if (Object.keys(er).length) return;
        record(trip, 'incident', loc, `${type}${note.trim() ? ` — ${note.trim()}` : ''}`);
        nav('/driver/home');
      }}>
        <SelectField label="Type d'incident" required value={type} onChange={(e) => setType(e.target.value)} error={errors.type}><option value="">Sélectionner…</option>{INCIDENT_TYPES.map((t) => <option key={t}>{t}</option>)}</SelectField>
        <SelectField label="Lieu approximatif" required value={loc} onChange={(e) => setLoc(e.target.value)} error={errors.loc}><option value="">Sélectionner…</option>{locations.map((l) => <option key={l}>{l}</option>)}</SelectField>
        <TextAreaField label="Description" value={note} onChange={(e) => setNote(e.target.value)} help="Restez bref. L'agence est prévenue dès l'envoi." />
        <Button type="submit" variant="primary" size="lg" block icon={<AlertTriangle size={20} aria-hidden />}>Envoyer le signalement</Button>
        <Link to="/driver/home" className="btn btn-secondary btn-lg btn-block">Annuler</Link>
      </form>
      <p className="small muted">En cas d'urgence, contactez directement les secours et votre agence.</p>
    </DriverShell>
  );
}

export function DriverProfile() {
  const user = useUser();
  const db = useDb();
  const { signOut } = useAuth();
  const nav = useNavigate();
  const net = useNetwork();
  const d = user.driverId ? driverById(db, user.driverId) : undefined;
  return (
    <DriverShell>
      <h1 style={{ fontSize: 23 }}>Profil</h1>
      <div className="drv-card">
        <dl className="dl">
          <dt>Nom</dt><dd>{d?.name ?? user.name}</dd>
          <dt>Téléphone</dt><dd className="mono">{d?.phone}</dd>
          <dt>Agence</dt><dd>{db.organizations.find((o) => o.id === user.organizationId)?.name}</dd>
          <dt>Bus attribué</dt><dd className="mono">{d?.assignedBusId ? busById(db, d.assignedBusId)?.registration : '—'}</dd>
        </dl>
      </div>
      {d && <div className="drv-card stack-sm"><h2 className="sub">Mes documents</h2>{driverDocuments(d).map((x) => <div key={x.label} className="row" style={{ justifyContent: 'space-between' }}><span>{x.label}<br /><span className="small muted">{fmtDate(x.expiry)}</span></span><DocBadge s={x.state} /></div>)}</div>}
      <p className="small muted">Les informations de l'agence, des véhicules et des passagers ne sont pas modifiables depuis cet espace.</p>
      <div className="drv-card">
        <label className="check"><input type="checkbox" checked={net.simulated} onChange={(e) => setSimulatedOffline(e.target.checked)} /><span><strong>Simuler l'absence de réseau</strong><br /><span className="small muted">Démonstration de la file locale et de la synchronisation.</span></span></label>
      </div>
      <Button size="lg" block icon={<LogOut size={20} aria-hidden />} onClick={() => { signOut(); nav('/login'); }}>Déconnexion</Button>
    </DriverShell>
  );
}
