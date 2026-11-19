import { useMemo, useState } from 'react';
import { useUser } from '../../auth/AuthContext';
import { useDb } from '../../data/store';
import { can } from '../../domain/permissions';
import { fmtDuration } from '../../lib/dates';
import { agencies, agencyTrips, computeStats, filterTripsForStats, policeAggregate, type StatsFilter } from '../../services/queries';
import { DataTable } from '../../components/DataTable';
import { Alert, FilterBar, FilterSelect, Kpi, PageTitle, Panel, SimTag } from '../../components/ui';

function Bars({ rows, unit, max }: { rows: { label: string; value: number | null }[]; unit: string; max?: number }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value ?? 0));
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar-row" key={r.label} title={`${r.label} : ${r.value ?? '—'} ${unit}`}>
          <span>{r.label}</span>
          <span className="bar-track" aria-hidden><span className="bar-fill" style={{ width: `${r.value ? Math.max(2, (r.value / m) * 100) : 0}%`, display: 'block' }} /></span>
          <span className="v">{r.value === null ? '—' : `${r.value} ${unit}`}</span>
        </div>
      ))}
    </div>
  );
}

export function StatisticsPage() {
  const user = useUser();
  const db = useDb();
  const global = can(user, 'admin.overview');
  const [f, setF] = useState<StatsFilter>({ range: 'all', direction: 'all' });
  const base = global ? db.trips : agencyTrips(db, user);
  const trips = useMemo(() => filterTripsForStats(base, f), [base, f]);
  const s = computeStats(db, trips);
  const agg = policeAggregate(db, user, new Set(trips.map((t) => t.id)));
  const perAgency = (global ? agencies(db).filter((a) => a.approvalStatus === 'approved') : agencies(db).filter((a) => a.id === user.organizationId))
    .map((a) => ({ a, s: computeStats(db, trips.filter((t) => t.agencyId === a.id)) }));

  return (
    <>
      <PageTitle title="Statistiques opérationnelles" lead={global ? 'Indicateurs agrégés de la phase pilote.' : 'Indicateurs de votre agence.'} badge={<SimTag>Données synthétiques</SimTag>} />
      <Alert kind="warning" title="Valeurs calculées sur le jeu de données fictif.">Elles ne constituent pas une mesure réelle de performance et ne peuvent pas être citées comme résultats du pilote.</Alert>
      <div style={{ height: 16 }} />
      <Panel flush>
        <FilterBar>
          <FilterSelect label="Période" value={f.range} onChange={(v) => setF({ ...f, range: v as StatsFilter['range'] })} options={[{ value: 'today', label: "Aujourd'hui" }, { value: '7d', label: '7 derniers jours' }, { value: 'all', label: 'Toute la période' }]} />
          <FilterSelect label="Sens" value={f.direction} onChange={(v) => setF({ ...f, direction: v as StatsFilter['direction'] })} options={[{ value: 'all', label: 'Les deux sens' }, { value: 'TG-BJ', label: 'Togo → Bénin' }, { value: 'BJ-TG', label: 'Bénin → Togo' }]} />
        </FilterBar>
      </Panel>
      <div style={{ height: 16 }} />
      <div className="kpis">
        <Kpi label="Temps moyen au poste frontalier" value={fmtDuration(s.borderTime)} note={`${s.borderSamples} voyage(s) mesuré(s)`} />
        <Kpi label="Voyages" value={s.trips} />
        <Kpi label="Passagers enregistrés" value={s.passengers} />
        <Kpi label="Taux de pré-inscription" value={s.preRate === null ? '—' : `${s.preRate} %`} />
        <Kpi label="Taux de réception des manifestes" value={s.receptionRate === null ? '—' : `${s.receptionRate} %`} note={s.failed ? `${s.failed} échec(s) de transmission` : undefined} tone={s.failed ? 'attention' : undefined} />
        <Kpi label="Délai moyen de traitement police" value={fmtDuration(s.policeResponse)} note="De l'envoi au traitement" />
        <Kpi label="Écarts de comptage" value={s.discrepancies} tone={s.discrepancies ? 'attention' : undefined} />
        {agg && <Kpi label="Résultats orange (agrégé)" value={agg.orange} note="Totaux sans détail nominatif" />}
        {agg && <Kpi label="Résultats rouges (agrégé)" value={agg.red} note="Totaux sans détail nominatif" />}
      </div>
      <div className="grid-2">
        <Panel title="Temps moyen au poste par agence" hint="Minutes, de l'arrivée au dernier contrôle enregistré">
          <Bars rows={perAgency.map(({ a, s: x }) => ({ label: a.name, value: x.borderTime }))} unit="min" />
        </Panel>
        <Panel title="Taux de pré-inscription par agence" hint="Part des passagers pré-inscrits">
          <Bars rows={perAgency.map(({ a, s: x }) => ({ label: a.name, value: x.preRate }))} unit="%" max={100} />
        </Panel>
      </div>
      <div style={{ height: 16 }} />
      <Panel title="Performance opérationnelle des agences" flush>
        <DataTable
          rows={perAgency} rowKey={(r) => r.a.id} caption="Performance des agences"
          columns={[
            { key: 'a', header: 'Agence', render: (r) => r.a.name },
            { key: 't', header: 'Voyages', render: (r) => r.s.trips, className: 'num' },
            { key: 'p', header: 'Passagers', render: (r) => r.s.passengers, className: 'num' },
            { key: 'pr', header: 'Pré-inscription', render: (r) => (r.s.preRate === null ? '—' : `${r.s.preRate} %`), className: 'num' },
            { key: 'rr', header: 'Réception manifestes', render: (r) => (r.s.receptionRate === null ? '—' : `${r.s.receptionRate} %`), className: 'num' },
            { key: 'bt', header: 'Temps au poste', render: (r) => fmtDuration(r.s.borderTime), className: 'num' },
            { key: 'd', header: 'Écarts', render: (r) => r.s.discrepancies, className: 'num' },
          ]}
        />
      </Panel>
    </>
  );
}
