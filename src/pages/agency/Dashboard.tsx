import { Link } from 'react-router-dom';
import { Plus, UserPlus, ScanLine, MapPinned } from 'lucide-react';
import { useUser } from '../../auth/AuthContext';
import { useDb } from '../../data/store';
import { can } from '../../domain/permissions';
import { busDocState, driverDocState, busAvailability } from '../../domain/documents';
import { STAGES } from '../../domain/corridor';
import { fmtTime, isSameDay } from '../../lib/dates';
import { activePts, agencyBuses, agencyDrivers, agencyTrips, busById, driverById, latestManifest, notificationsFor } from '../../services/queries';
import { markNotificationRead } from '../../services/api';
import { DataTable } from '../../components/DataTable';
import { DirectionLabel, DocBadge, RecipientBadge, TripStatusBadge } from '../../components/status';
import { NotificationList, tripStage } from '../../components/domain';
import { Kpi, PageTitle, Panel } from '../../components/ui';

export default function AgencyDashboard() {
  const user = useUser();
  const db = useDb();
  const trips = agencyTrips(db, user);
  const today = trips.filter((t) => isSameDay(t.scheduledDeparture) && t.status !== 'cancelled');
  const onRoad = trips.filter((t) => ['en_route', 'approaching_border', 'at_border'].includes(t.status));
  const ptsToday = db.passengerTrips.filter((pt) => !pt.removedAt && today.some((t) => t.id === pt.tripId));
  const awaiting = db.passengerTrips.filter((pt) => !pt.removedAt && pt.boardingStatus === 'pending' && trips.some((t) => t.id === pt.tripId && ['preparing', 'boarding', 'planned'].includes(t.status)));
  const manifestsWaiting = trips.flatMap((t) => db.manifests.filter((m) => m.tripId === t.id)).filter((m) => m.recipients.some((r) => ['to_send', 'pending', 'failed'].includes(r.state)));
  const buses = agencyBuses(db, user);
  const drivers = agencyDrivers(db, user);
  const docsAttention = buses.filter((b) => busDocState(b) !== 'valid').length + drivers.filter((d) => driverDocState(d) !== 'valid').length;
  const upcoming = trips.filter((t) => ['planned', 'preparing', 'boarding', 'boarding_closed'].includes(t.status)).sort((a, b) => a.scheduledDeparture.localeCompare(b.scheduledDeparture));
  const recent = trips.filter((t) => !['planned', 'preparing'].includes(t.status)).slice(0, 6);
  const stageCounts = STAGES.map((_, i) => trips.filter((t) => t.status !== 'cancelled' && isSameDay(t.scheduledDeparture) && tripStage(t) === i).length);
  const notifs = notificationsFor(db, user);
  const boardingTrip = trips.find((t) => t.status === 'boarding');
  const regTrip = upcoming.find((t) => t.status !== 'boarding_closed');

  return (
    <>
      <PageTitle
        title="Tableau de bord"
        lead="Activité opérationnelle de votre agence aujourd'hui."
        actions={
          <>
            {can(user, 'agency.trip.create') && <Link to="/agency/trips/new" className="btn btn-primary"><Plus size={18} aria-hidden />Créer un voyage</Link>}
            {can(user, 'agency.passenger.register') && regTrip && <Link to={`/agency/trips/${regTrip.id}/register`} className="btn btn-secondary"><UserPlus size={18} aria-hidden />Enregistrer un passager</Link>}
            {can(user, 'agency.boarding.operate') && upcoming[0] && <Link to={`/agency/trips/${(boardingTrip ?? upcoming[0]).id}/boarding`} className="btn btn-secondary"><ScanLine size={18} aria-hidden />Ouvrir l'embarquement</Link>}
            <Link to="/agency/tracking" className="btn btn-secondary"><MapPinned size={18} aria-hidden />Consulter le suivi des trajets</Link>
          </>
        }
      />
      <div className="kpis">
        <Kpi label="Voyages prévus aujourd'hui" value={today.length} to="/agency/trips" />
        <Kpi label="Bus sur la route" value={onRoad.length} to="/agency/tracking" />
        <Kpi label="Passagers enregistrés aujourd'hui" value={ptsToday.length} />
        <Kpi label="En attente d'embarquement" value={awaiting.length} />
        <Kpi label="Manifestes en attente d'accusé" value={manifestsWaiting.length} tone={manifestsWaiting.some((m) => m.recipients.some((r) => r.state === 'failed')) ? 'attention' : undefined} note={manifestsWaiting.some((m) => m.recipients.some((r) => r.state === 'failed')) ? 'Dont échec de transmission' : undefined} />
        <Kpi label="Documents à surveiller" value={docsAttention} tone={docsAttention ? 'attention' : undefined} to="/agency/fleet" />
      </div>

      <Panel title="Activité des voyages du jour" hint="Nombre de voyages d'aujourd'hui à chaque étape">
        <ol className="trip-progress" aria-label="Répartition des voyages par étape">
          {STAGES.map((s, i) => (
            <li key={s} className={stageCounts[i] ? 'done' : ''}>
              <span className="bar" />
              <span className="lbl">{s}</span>
              <span className="strong mono" style={{ fontSize: 18 }}>{stageCounts[i]}</span>
            </li>
          ))}
        </ol>
      </Panel>
      <div style={{ height: 16 }} />

      <div className="grid-main-side">
        <div className="stack">
          <Panel title="Prochains départs" flush actions={<Link to="/agency/trips" className="btn btn-ghost btn-sm">Tous les voyages</Link>}>
            <DataTable
              rows={upcoming} rowKey={(t) => t.id} caption="Prochains départs" empty="Aucun départ programmé."
              columns={[
                { key: 'ref', header: 'Voyage', render: (t) => <Link to={`/agency/trips/${t.id}`} className="mono">{t.reference}</Link> },
                { key: 'h', header: 'Départ', render: (t) => <span className="mono">{fmtTime(t.scheduledDeparture)}{!isSameDay(t.scheduledDeparture) && <span className="small muted"> (demain ou plus)</span>}</span> },
                { key: 'd', header: 'Sens', render: (t) => <DirectionLabel d={t.direction} /> },
                { key: 'b', header: 'Bus', render: (t) => <span className="mono">{busById(db, t.busId)?.registration}</span> },
                { key: 'p', header: 'Passagers', render: (t) => activePts(db, t.id).length, className: 'num' },
                { key: 's', header: 'Statut', render: (t) => <TripStatusBadge s={t.status} /> },
              ]}
            />
          </Panel>
          <Panel title="Voyages récents" flush>
            <DataTable
              rows={recent} rowKey={(t) => t.id} caption="Voyages récents" empty="Aucun voyage récent."
              columns={[
                { key: 'ref', header: 'Voyage', render: (t) => <Link to={`/agency/trips/${t.id}`} className="mono">{t.reference}</Link> },
                { key: 'drv', header: 'Chauffeur', render: (t) => driverById(db, t.driverId)?.name },
                { key: 's', header: 'Statut', render: (t) => <TripStatusBadge s={t.status} /> },
                { key: 'm', header: 'Dernier manifeste', render: (t) => { const m = latestManifest(db, t.id); return m ? <span className="row" style={{ gap: 4 }}>{m.recipients.map((r) => <RecipientBadge key={r.authority} s={r.state} />)}</span> : '—'; } },
              ]}
            />
          </Panel>
        </div>
        <div className="stack">
          <Panel title="État du parc" flush actions={<Link to="/agency/fleet" className="btn btn-ghost btn-sm">Parc automobile</Link>}>
            <ul className="notif-list">
              {buses.map((b) => (
                <li key={b.id} className="row" style={{ padding: '10px 14px', justifyContent: 'space-between' }}>
                  <span><span className="mono strong">{b.registration}</span><br /><span className="small muted">{busAvailability(b).available ? 'Disponible' : `Indisponible — ${busAvailability(b).reason}`}</span></span>
                  <DocBadge s={busDocState(b)} />
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Notifications récentes" flush actions={<Link to="/agency/notifications" className="btn btn-ghost btn-sm">Tout voir</Link>}>
            <NotificationList items={notifs} userId={user.id} limit={4} onOpen={(n) => markNotificationRead(user, n.id)} />
          </Panel>
        </div>
      </div>
    </>
  );
}
