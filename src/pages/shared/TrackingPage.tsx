import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '../../auth/AuthContext';
import { useDb } from '../../data/store';
import { can } from '../../domain/permissions';
import { agencyTrips, busById, driverById, orgById } from '../../services/queries';
import { fmtDateTime, fmtTime, relative, isSameDay } from '../../lib/dates';
import { DataTable } from '../../components/DataTable';
import { DirectionLabel, TripStatusBadge } from '../../components/status';
import { EventTimeline, RouteProgress, TripProgress } from '../../components/domain';
import { Alert, FilterBar, FilterSelect, PageTitle, Panel, SearchField } from '../../components/ui';
import { tripStatusLabel } from '../../domain/labels';
import type { Trip } from '../../domain/types';

/** Suivi des trajets : flotte de l'agence (agence) ou flotte globale (administration centrale). */
export function TrackingPage() {
  const user = useUser();
  const db = useDb();
  const global = can(user, 'admin.overview');
  const base = global ? db.trips : agencyTrips(db, user);
  const [q, setQ] = useState('');
  const [scope, setScope] = useState('active');
  const [dir, setDir] = useState('all');
  const [agency, setAgency] = useState('all');
  const trips = useMemo(() => base
    .filter((t) => scope === 'all' || (scope === 'active' ? ['boarding_closed', 'en_route', 'approaching_border', 'at_border'].includes(t.status) : isSameDay(t.scheduledDeparture)))
    .filter((t) => dir === 'all' || t.direction === dir)
    .filter((t) => agency === 'all' || t.agencyId === agency)
    .filter((t) => { const s = q.trim().toLowerCase(); return !s || `${t.reference} ${busById(db, t.busId)?.registration} ${driverById(db, t.driverId)?.name}`.toLowerCase().includes(s); })
    .sort((a, b) => a.scheduledDeparture.localeCompare(b.scheduledDeparture)), [base, scope, dir, agency, q, db]);
  const [sel, setSel] = useState<string | null>(null);
  const selected: Trip | undefined = trips.find((t) => t.id === sel) ?? trips[0];
  const detailBase = global ? '/admin/trips' : '/agency/trips';
  return (
    <>
      <PageTitle title="Suivi des trajets" lead={global ? 'Vue globale de la flotte suivie pendant la phase pilote.' : 'Trajets des véhicules de votre agence.'} />
      <Alert kind="info" title="Aucun fournisseur de cartes ni suivi GPS n'est configuré.">Les positions proviennent des événements déclarés par les chauffeurs et sont des données de démonstration. Une frise d'itinéraire remplace la carte.</Alert>
      <div style={{ height: 16 }} />
      <div className="grid-main-side">
        <Panel flush title="Trajets">
          <FilterBar>
            <SearchField label="Rechercher un trajet" value={q} onChange={setQ} placeholder="Référence, immatriculation, chauffeur…" />
            <FilterSelect label="Période" value={scope} onChange={setScope} options={[{ value: 'active', label: 'En circulation' }, { value: 'today', label: "Aujourd'hui" }, { value: 'all', label: 'Tous' }]} />
            <FilterSelect label="Sens" value={dir} onChange={setDir} options={[{ value: 'all', label: 'Les deux sens' }, { value: 'TG-BJ', label: 'Togo → Bénin' }, { value: 'BJ-TG', label: 'Bénin → Togo' }]} />
            {global && <FilterSelect label="Agence" value={agency} onChange={setAgency} options={[{ value: 'all', label: 'Toutes' }, ...db.organizations.filter((o) => o.type === 'agency').map((o) => ({ value: o.id, label: o.name }))]} />}
          </FilterBar>
          <DataTable
            rows={trips} rowKey={(t) => t.id} caption="Trajets suivis" empty="Aucun trajet ne correspond à ces critères." selectedKey={selected?.id} onRowClick={(t) => setSel(t.id)}
            columns={[
              { key: 'ref', header: 'Référence', render: (t) => <button type="button" className="btn btn-ghost btn-sm" style={{ padding: 0 }} onClick={() => setSel(t.id)}><span className="mono">{t.reference}</span></button> },
              ...(global ? [{ key: 'ag', header: 'Agence', render: (t: Trip) => orgById(db, t.agencyId)?.name }] : []),
              { key: 'bus', header: 'Bus', render: (t) => <span className="mono">{busById(db, t.busId)?.registration}</span> },
              { key: 'drv', header: 'Chauffeur', render: (t) => driverById(db, t.driverId)?.name },
              { key: 'dir', header: 'Sens', render: (t) => <DirectionLabel d={t.direction} /> },
              { key: 'dep', header: 'Départ', render: (t) => <span className="mono">{fmtTime(t.actualDeparture ?? t.scheduledDeparture)}{!t.actualDeparture && <span className="small muted"> prévu</span>}</span> },
              { key: 'st', header: 'Étape', render: (t) => <TripStatusBadge s={t.status} /> },
              { key: 'upd', header: 'Dernière mise à jour', render: (t) => (t.lastPosition ? relative(t.lastPosition.at) : '—') },
              { key: 'eta', header: 'Arrivée estimée', render: (t) => <span className="mono">{t.status === 'arrived' ? `${fmtTime(t.actualArrival)} (réelle)` : fmtTime(t.estimatedArrival)}</span> },
            ]}
          />
        </Panel>
        {selected && (
          <Panel title={<span className="mono">{selected.reference}</span>} hint={`${tripStatusLabel[selected.status]} · ${busById(db, selected.busId)?.registration}`} actions={<Link className="btn btn-secondary btn-sm" to={`${detailBase}/${selected.id}`}>Ouvrir le voyage</Link>}>
            <div className="stack">
              <TripProgress trip={selected} />
              <RouteProgress trip={selected} />
              <dl className="dl">
                <dt>Départ prévu</dt><dd>{fmtDateTime(selected.scheduledDeparture)}</dd>
                <dt>Départ réel</dt><dd>{fmtDateTime(selected.actualDeparture)}</dd>
                <dt>Arrivée frontière</dt><dd>{fmtDateTime(selected.borderArrival)}</dd>
                <dt>Arrivée destination</dt><dd>{selected.actualArrival ? fmtDateTime(selected.actualArrival) : `Estimée ${fmtTime(selected.estimatedArrival)}`}</dd>
                <dt>Arrêts autorisés</dt><dd>{selected.stops.join(', ') || 'Aucun'}</dd>
              </dl>
              <hr className="divider" />
              <h3 className="sub">Événements</h3>
              <EventTimeline db={db} tripId={selected.id} />
            </div>
          </Panel>
        )}
      </div>
    </>
  );
}
