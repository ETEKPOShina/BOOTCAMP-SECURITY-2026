import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ClipboardCheck, PackageSearch } from 'lucide-react';
import { useUser } from '../../auth/AuthContext';
import { useDb } from '../../data/store';
import { borderPostName } from '../../domain/labels';
import { fullName } from '../../domain/passenger';
import { fmtDateTime, fmtTime } from '../../lib/dates';
import { activePts, busById, corridorTrips, countryOf, orgById, passengerOf, userName } from '../../services/queries';
import { customsRecordHandling } from '../../services/api';
import { useAction } from '../../hooks/useAction';
import { DataTable } from '../../components/DataTable';
import { DirectionLabel, StatusBadge, TripStatusBadge } from '../../components/status';
import { Dialog } from '../../components/Dialog';
import { Alert, Button, ErrorState, FilterBar, FilterSelect, Kpi, PageTitle, Panel, SearchField, TextAreaField } from '../../components/ui';
import type { DbState, PassengerTrip, Trip } from '../../domain/types';

// Les douanes ne consultent que les bagages et marchandises déclarées : aucune donnée police n'est lue ici.
const onBoard = (db: DbState, t: Trip): PassengerTrip[] => activePts(db, t.id).filter((pt) => pt.boardingStatus === 'boarded');
const bagTotal = (db: DbState, t: Trip) => onBoard(db, t).reduce((s, pt) => s + pt.baggageCount, 0);
const goodsCount = (db: DbState, t: Trip) => onBoard(db, t).filter((pt) => pt.commercialGoods).length;

function useCustoms() {
  const user = useUser();
  const db = useDb();
  const c = countryOf(db, user)!;
  const trips = corridorTrips(db, user).filter((t) => ['boarding_closed', 'en_route', 'approaching_border', 'at_border', 'arrived'].includes(t.status));
  return { user, db, c, trips };
}

const arrivedFor = (t: Trip) => ['at_border', 'arrived'].includes(t.status) || !!t.border.TG.arrivedAt || !!t.border.BJ.arrivedAt;

function TripsTable({ trips, db, c }: { trips: Trip[]; db: DbState; c: 'TG' | 'BJ' }) {
  return (
    <DataTable rows={trips} rowKey={(t) => t.id} caption="Bus et bagages" empty="Aucun bus."
      columns={[
        { key: 'r', header: 'Voyage', render: (t) => <Link className="mono" to={`/customs/trips/${t.id}`}>{t.reference}</Link> },
        { key: 'b', header: 'Immatriculation', render: (t) => <span className="mono">{busById(db, t.busId)?.registration}</span> },
        { key: 'a', header: 'Agence', render: (t) => orgById(db, t.agencyId)?.name },
        { key: 'd', header: 'Sens', render: (t) => <DirectionLabel d={t.direction} /> },
        { key: 'p', header: 'Passagers', render: (t) => onBoard(db, t).length, className: 'num' },
        { key: 'g', header: 'Bagages', render: (t) => bagTotal(db, t), className: 'num' },
        { key: 'm', header: 'Marchandises', render: (t) => (goodsCount(db, t) ? <StatusBadge tone="orange">{goodsCount(db, t)} déclaration(s)</StatusBadge> : <span className="muted">Aucune</span>) },
        { key: 's', header: 'Statut', render: (t) => <TripStatusBadge s={t.status} /> },
        { key: 'h', header: 'Prise en charge', render: (t) => (t.customs.some((x) => x.country === c) ? <StatusBadge tone="green">Enregistrée</StatusBadge> : '—') },
      ]} />
  );
}

export function CustomsDashboard() {
  const { db, c, trips } = useCustoms();
  const expected = trips.filter((t) => !arrivedFor(t));
  const arrived = trips.filter((t) => arrivedFor(t) && t.status !== 'arrived');
  const active = trips.filter((t) => t.status !== 'arrived');
  return (
    <>
      <PageTitle title="Tableau de bord" lead={`Consultation des bus et des bagages déclarés — ${borderPostName[c]}.`} />
      <Alert kind="neutral">Accès en lecture seule. Les inspections physiques et les décisions douanières relèvent exclusivement des agents des douanes.</Alert>
      <div style={{ height: 16 }} />
      <div className="kpis">
        <Kpi label="Bus attendus" value={expected.length} to="/customs/arrivals" />
        <Kpi label="Bus arrivés au poste" value={arrived.length} to="/customs/arrivals" />
        <Kpi label="Bagages déclarés (bus en cours)" value={active.reduce((s, t) => s + bagTotal(db, t), 0)} to="/customs/baggage" />
        <Kpi label="Voyages avec marchandises" value={active.filter((t) => goodsCount(db, t) > 0).length} to="/customs/declarations" />
      </div>
      <Panel title="Arrivées récentes et bus attendus" flush actions={<Link className="btn btn-ghost btn-sm" to="/customs/arrivals">Tout voir</Link>}>
        <TripsTable trips={active} db={db} c={c} />
      </Panel>
    </>
  );
}

export function CustomsArrivals() {
  const { db, c, trips } = useCustoms();
  const [scope, setScope] = useState('active');
  const [dir, setDir] = useState('all');
  const rows = trips.filter((t) => (scope === 'all' || (scope === 'active' ? t.status !== 'arrived' : arrivedFor(t))) && (dir === 'all' || t.direction === dir));
  return (
    <>
      <PageTitle title="Arrivées" lead="Bus attendus et arrivés au poste frontalier." />
      <Panel flush>
        <FilterBar>
          <FilterSelect label="Afficher" value={scope} onChange={setScope} options={[{ value: 'active', label: 'En cours' }, { value: 'arrived', label: 'Arrivés' }, { value: 'all', label: 'Tous' }]} />
          <FilterSelect label="Sens" value={dir} onChange={setDir} options={[{ value: 'all', label: 'Les deux sens' }, { value: 'TG-BJ', label: 'Togo → Bénin' }, { value: 'BJ-TG', label: 'Bénin → Togo' }]} />
        </FilterBar>
        <TripsTable trips={rows} db={db} c={c} />
      </Panel>
    </>
  );
}

export function CustomsTrip() {
  const { id = '' } = useParams();
  const { user, db, c, trips } = useCustoms();
  const { run, busy } = useAction();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const t = trips.find((x) => x.id === id);
  if (!t) return <ErrorState title="Voyage introuvable" action={<Link className="btn btn-secondary" to="/customs/arrivals">Arrivées</Link>}>Ce voyage n'est pas visible depuis votre espace.</ErrorState>;
  const pts = onBoard(db, t);
  const handled = t.customs.find((x) => x.country === c);
  return (
    <>
      <PageTitle title="Consultation des bagages" crumbs={[{ label: 'Arrivées', to: '/customs/arrivals' }, { label: t.reference }]}
        lead={<><span className="mono">{t.reference}</span> · <DirectionLabel d={t.direction} /></>} badge={<TripStatusBadge s={t.status} />}
        actions={!handled && <Button variant="primary" icon={<ClipboardCheck size={18} aria-hidden />} onClick={() => setOpen(true)}>Enregistrer la prise en charge</Button>} />
      {handled && <><Alert kind="success" title="Prise en charge douanière enregistrée.">{userName(db, handled.handledBy)} · {fmtDateTime(handled.handledAt)}{handled.note && ` — ${handled.note}`}. Ce n'est pas une décision douanière.</Alert><div style={{ height: 16 }} /></>}
      <div className="kpis">
        <Kpi label="Immatriculation" value={<span style={{ fontSize: 18 }} className="mono">{busById(db, t.busId)?.registration}</span>} />
        <Kpi label="Agence" value={<span style={{ fontSize: 16 }}>{orgById(db, t.agencyId)?.name}</span>} />
        <Kpi label="Passagers" value={pts.length} />
        <Kpi label="Bagages au total" value={bagTotal(db, t)} />
        <Kpi label="Marchandises déclarées" value={goodsCount(db, t)} tone={goodsCount(db, t) ? 'attention' : undefined} />
        <Kpi label="Arrivée au poste" value={<span style={{ fontSize: 18 }}>{fmtTime(t.borderArrival)}</span>} />
      </div>
      <Panel title="Bagages par passager" flush>
        <DataTable rows={pts} rowKey={(pt) => pt.id} caption="Bagages par passager" pageSize={25}
          columns={[
            { key: 'n', header: 'Passager', render: (pt) => fullName(passengerOf(db, pt)) },
            { key: 't', header: 'Billet', render: (pt) => <span className="mono">{pt.ticketReference}</span> },
            { key: 'b', header: 'Bagages', render: (pt) => pt.baggageCount, className: 'num' },
            { key: 'l', header: 'Étiquettes', render: (pt) => <span className="small mono">{db.baggage.filter((b) => b.passengerTripId === pt.id).map((b) => b.labelReference.split('-').pop()).join(', ') || '—'}</span> },
            { key: 'g', header: 'Marchandises commerciales déclarées', render: (pt) => pt.commercialGoods || <span className="muted">Aucune</span> },
          ]} />
      </Panel>
      <Dialog open={open} title="Enregistrer la prise en charge" onClose={() => setOpen(false)} description="Indique que le processus d'inspection douanière a été traité pour ce bus. Aucune décision douanière n'est enregistrée ni simulée par la plateforme."
        footer={<><Button onClick={() => setOpen(false)}>Annuler</Button><Button variant="primary" loading={busy === 'h'} onClick={async () => { await run('h', () => customsRecordHandling(user, t.id, note), 'Votre modification a été enregistrée.'); setOpen(false); setNote(''); }}>Enregistrer</Button></>}>
        <TextAreaField label="Observation (facultatif)" value={note} onChange={(e) => setNote(e.target.value)} />
      </Dialog>
    </>
  );
}

export function CustomsBaggage({ declarationsOnly }: { declarationsOnly?: boolean }) {
  const { db, trips } = useCustoms();
  const [q, setQ] = useState('');
  const [tripId, setTripId] = useState('all');
  const rows = useMemo(() => trips.filter((t) => tripId === 'all' || t.id === tripId).flatMap((t) => onBoard(db, t).map((pt) => ({ pt, t })))
    .filter(({ pt, t }) => (!declarationsOnly || pt.commercialGoods) && (!q.trim() || `${pt.ticketReference} ${t.reference} ${busById(db, t.busId)?.registration} ${pt.commercialGoods} ${fullName(passengerOf(db, pt))}`.toLowerCase().includes(q.trim().toLowerCase()))), [trips, tripId, db, q, declarationsOnly]);
  return (
    <>
      <PageTitle title={declarationsOnly ? 'Déclarations de marchandises' : 'Bagages'} lead={declarationsOnly ? 'Marchandises commerciales déclarées par les voyageurs auprès des agences.' : 'Bagages enregistrés par billet.'} />
      <Panel flush>
        <FilterBar>
          <SearchField label="Rechercher" value={q} onChange={setQ} placeholder="Billet, voyage, immatriculation, marchandise…" />
          <FilterSelect label="Voyage" value={tripId} onChange={setTripId} options={[{ value: 'all', label: 'Tous les voyages' }, ...trips.map((t) => ({ value: t.id, label: `${t.reference} · ${busById(db, t.busId)?.registration}` }))]} />
          <span className="small muted" aria-live="polite">{rows.length} ligne(s) · {rows.reduce((s, r) => s + r.pt.baggageCount, 0)} bagage(s)</span>
        </FilterBar>
        <DataTable rows={rows} rowKey={(r) => r.pt.id} caption="Bagages" empty="Aucun résultat." emptyHint={<PackageSearch size={20} aria-hidden />}
          columns={[
            { key: 't', header: 'Voyage', render: (r) => <Link className="mono" to={`/customs/trips/${r.t.id}`}>{r.t.reference}</Link> },
            { key: 'b', header: 'Immatriculation', render: (r) => <span className="mono">{busById(db, r.t.busId)?.registration}</span> },
            { key: 'n', header: 'Passager', render: (r) => fullName(passengerOf(db, r.pt)) },
            { key: 'k', header: 'Billet', render: (r) => <span className="mono">{r.pt.ticketReference}</span> },
            { key: 'c', header: 'Bagages', render: (r) => r.pt.baggageCount, className: 'num' },
            { key: 'g', header: 'Marchandises déclarées', render: (r) => r.pt.commercialGoods || <span className="muted">Aucune</span> },
          ]} />
      </Panel>
    </>
  );
}

export function CustomsHistory() {
  const { db, c, trips } = useCustoms();
  const rows = trips.filter((t) => t.customs.some((x) => x.country === c));
  return (
    <>
      <PageTitle title="Historique" lead="Prises en charge enregistrées par votre service." />
      <Panel flush>
        <DataTable rows={rows} rowKey={(t) => t.id} caption="Historique des prises en charge" empty="Aucune prise en charge enregistrée."
          columns={[
            { key: 'r', header: 'Voyage', render: (t) => <Link className="mono" to={`/customs/trips/${t.id}`}>{t.reference}</Link> },
            { key: 'b', header: 'Immatriculation', render: (t) => <span className="mono">{busById(db, t.busId)?.registration}</span> },
            { key: 'g', header: 'Bagages', render: (t) => bagTotal(db, t), className: 'num' },
            { key: 'h', header: 'Enregistrée le', render: (t) => <span className="mono">{fmtDateTime(t.customs.find((x) => x.country === c)!.handledAt)}</span> },
            { key: 'u', header: 'Agent', render: (t) => userName(db, t.customs.find((x) => x.country === c)!.handledBy) },
            { key: 'o', header: 'Observation', render: (t) => t.customs.find((x) => x.country === c)!.note || '—' },
          ]} />
      </Panel>
    </>
  );
}
