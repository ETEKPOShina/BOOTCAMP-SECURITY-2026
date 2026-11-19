import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';
import { useUser } from '../../auth/AuthContext';
import { useDb } from '../../data/store';
import { can } from '../../domain/permissions';
import { AUTHORIZED_STOP_OPTIONS, endpoints } from '../../domain/corridor';
import { tripStatusLabel } from '../../domain/labels';
import { busAvailability, driverAvailability } from '../../domain/documents';
import { dateOffset, fmtDate, fmtTime, toDateInput } from '../../lib/dates';
import { activePts, agencyBuses, agencyDrivers, agencyTrips, busById, driverById } from '../../services/queries';
import { createTrip, generateTripReference } from '../../services/api';
import { useAction } from '../../hooks/useAction';
import { DataTable } from '../../components/DataTable';
import { DirectionLabel, TripStatusBadge } from '../../components/status';
import { Alert, Button, FilterBar, FilterSelect, PageTitle, Panel, SearchField, SelectField, TextField } from '../../components/ui';
import type { Direction, TripStatus } from '../../domain/types';

export function TripsList() {
  const user = useUser();
  const db = useDb();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const status = params.get('statut') ?? 'all';
  const [dir, setDir] = useState('all');
  const [period, setPeriod] = useState('all');
  const trips = agencyTrips(db, user);
  const rows = useMemo(() => trips.filter((t) => {
    const s = q.trim().toLowerCase();
    if (s && !`${t.reference} ${busById(db, t.busId)?.registration} ${driverById(db, t.driverId)?.name}`.toLowerCase().includes(s)) return false;
    if (status !== 'all' && t.status !== status) return false;
    if (dir !== 'all' && t.direction !== dir) return false;
    const day = toDateInput(t.scheduledDeparture);
    if (period === 'today' && day !== dateOffset(0)) return false;
    if (period === 'upcoming' && day < dateOffset(0)) return false;
    if (period === 'past' && day >= dateOffset(0)) return false;
    return true;
  }), [trips, q, status, dir, period, db]);
  const boardingMode = status === 'boarding';

  return (
    <>
      <PageTitle
        title={boardingMode ? 'Embarquement' : 'Voyages'}
        lead={boardingMode ? 'Voyages dont l’embarquement est en cours. Ouvrez l’écran d’embarquement pour scanner les billets.' : 'Voyages de votre agence sur le corridor Lomé – Cotonou.'}
        crumbs={[{ label: 'Tableau de bord', to: '/agency/dashboard' }, { label: boardingMode ? 'Embarquement' : 'Voyages' }]}
        actions={can(user, 'agency.trip.create') && <Link to="/agency/trips/new" className="btn btn-primary"><Plus size={18} aria-hidden />Créer un voyage</Link>}
      />
      <Panel flush>
        <FilterBar>
          <SearchField label="Rechercher un voyage" value={q} onChange={setQ} placeholder="Référence, immatriculation, chauffeur…" />
          <FilterSelect label="Statut" value={status} onChange={(v) => { const p = new URLSearchParams(params); if (v === 'all') p.delete('statut'); else p.set('statut', v); setParams(p); }} options={[{ value: 'all', label: 'Tous les statuts' }, ...(Object.keys(tripStatusLabel) as TripStatus[]).map((s) => ({ value: s, label: tripStatusLabel[s] }))]} />
          <FilterSelect label="Sens" value={dir} onChange={setDir} options={[{ value: 'all', label: 'Les deux sens' }, { value: 'TG-BJ', label: 'Togo → Bénin' }, { value: 'BJ-TG', label: 'Bénin → Togo' }]} />
          <FilterSelect label="Date" value={period} onChange={setPeriod} options={[{ value: 'all', label: 'Toutes' }, { value: 'today', label: "Aujourd'hui" }, { value: 'upcoming', label: 'À venir' }, { value: 'past', label: 'Passés' }]} />
        </FilterBar>
        <DataTable
          rows={rows} rowKey={(t) => t.id} caption="Liste des voyages" empty="Aucun voyage ne correspond à ces critères."
          columns={[
            { key: 'ref', header: 'Référence', render: (t) => <Link to={`/agency/trips/${t.id}`} className="mono">{t.reference}</Link> },
            { key: 'date', header: 'Date', render: (t) => <span className="mono nowrap">{fmtDate(t.scheduledDeparture)} {fmtTime(t.scheduledDeparture)}</span> },
            { key: 'dir', header: 'Sens', render: (t) => <DirectionLabel d={t.direction} /> },
            { key: 'bus', header: 'Bus', render: (t) => <span className="mono">{busById(db, t.busId)?.registration}</span> },
            { key: 'drv', header: 'Chauffeur', render: (t) => driverById(db, t.driverId)?.name },
            { key: 'pax', header: 'Passagers', render: (t) => `${activePts(db, t.id).length} / ${busById(db, t.busId)?.capacity ?? '—'}`, className: 'num' },
            { key: 'st', header: 'Statut', render: (t) => <TripStatusBadge s={t.status} /> },
            { key: 'act', header: 'Action', mobile: true, render: (t) => t.status === 'boarding' && can(user, 'agency.boarding.operate') ? <Link className="btn btn-secondary btn-sm" to={`/agency/trips/${t.id}/boarding`}>Embarquement</Link> : <Link className="btn btn-ghost btn-sm" to={`/agency/trips/${t.id}`}>Ouvrir</Link> },
          ]}
        />
      </Panel>
    </>
  );
}

export function TripNew() {
  const user = useUser();
  const db = useDb();
  const nav = useNavigate();
  const { run, busy } = useAction();
  const buses = agencyBuses(db, user);
  const drivers = agencyDrivers(db, user);
  const [f, setF] = useState({ direction: 'TG-BJ' as Direction, date: dateOffset(1), time: '08:00', busId: '', driverId: '', convoyeur: '', stops: [] as string[] });
  const [ref, setRef] = useState(() => generateTripReference('TG-BJ', dateOffset(1)));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const ep = endpoints(f.direction);

  const update = (patch: Partial<typeof f>) => {
    const next = { ...f, ...patch };
    setF(next);
    if (patch.direction || patch.date) setRef(generateTripReference(next.direction, next.date || dateOffset(0)));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!f.date) er.date = 'Ce champ est obligatoire.';
    else if (f.date < dateOffset(0)) er.date = 'La date ne peut pas être dans le passé.';
    if (!f.time) er.time = 'Ce champ est obligatoire.';
    if (!f.busId) er.busId = 'Sélectionnez un bus disponible.';
    if (!f.driverId) er.driverId = 'Sélectionnez un chauffeur disponible.';
    setErrors(er);
    if (Object.keys(er).length) { document.getElementById(`trip-${Object.keys(er)[0]}`)?.focus(); return; }
    const t = await run('save', () => createTrip(user, { ...f, ...ep }, ref), 'Voyage enregistré.');
    if (t) nav(`/agency/trips/${t.id}`);
  };

  return (
    <>
      <PageTitle title="Créer un nouveau voyage" crumbs={[{ label: 'Voyages', to: '/agency/trips' }, { label: 'Nouveau voyage' }]} lead="Pilote : liaison Lomé – Cotonou dans les deux sens." />
      <form className="panel" onSubmit={onSubmit} noValidate style={{ maxWidth: 920 }}>
        <div className="panel-body stack">
          <div className="form-grid">
            <div className="field">
              <span className="label">Référence du voyage</span>
              <div className="row"><span className="input mono" style={{ display: 'flex', alignItems: 'center', background: 'var(--muted)' }} aria-live="polite">{ref}</span>
                <Button size="sm" variant="ghost" icon={<RefreshCw size={14} aria-hidden />} onClick={() => setRef(generateTripReference(f.direction, f.date || dateOffset(0)))}>Régénérer</Button></div>
              <span className="help">Générée automatiquement.</span>
            </div>
            <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label" style={{ marginBottom: 6 }}>Sens du trajet<span className="req" aria-hidden>*</span></legend>
              <div className="radio-cards">
                {(['TG-BJ', 'BJ-TG'] as Direction[]).map((d) => (
                  <label key={d} className="radio-card"><input type="radio" name="direction" checked={f.direction === d} onChange={() => update({ direction: d })} /><span><strong>{d === 'TG-BJ' ? 'Lomé → Cotonou' : 'Cotonou → Lomé'}</strong><br /><span className="small muted">{d === 'TG-BJ' ? 'Togo → Bénin' : 'Bénin → Togo'}</span></span></label>
                ))}
              </div>
            </fieldset>
            <TextField id="trip-date" label="Date" type="date" required value={f.date} min={dateOffset(0)} onChange={(e) => update({ date: e.target.value })} error={errors.date} />
            <TextField id="trip-time" label="Heure de départ prévue" type="time" required value={f.time} onChange={(e) => update({ time: e.target.value })} error={errors.time} />
            <TextField label="Point de départ" value={ep.departure} readOnly help="Fixé par le sens du trajet (pilote)." />
            <TextField label="Destination" value={ep.destination} readOnly help="Fixée par le sens du trajet (pilote)." />
            <SelectField id="trip-busId" label="Bus" required value={f.busId} onChange={(e) => update({ busId: e.target.value })} error={errors.busId} help="Les bus dont un document obligatoire est expiré sont indisponibles.">
              <option value="">Sélectionner un bus…</option>
              {buses.map((b) => { const a = busAvailability(b); return <option key={b.id} value={b.id} disabled={!a.available}>{b.registration} · {b.capacity} places{a.available ? '' : ` — indisponible (${a.reason})`}</option>; })}
            </SelectField>
            <SelectField id="trip-driverId" label="Chauffeur" required value={f.driverId} onChange={(e) => update({ driverId: e.target.value })} error={errors.driverId}>
              <option value="">Sélectionner un chauffeur…</option>
              {drivers.map((d) => { const a = driverAvailability(d); return <option key={d.id} value={d.id} disabled={!a.available}>{d.name}{a.available ? '' : ` — indisponible (${a.reason})`}</option>; })}
            </SelectField>
            <TextField label="Convoyeur, si applicable" value={f.convoyeur} onChange={(e) => update({ convoyeur: e.target.value })} />
            <fieldset className="field span-2" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label" style={{ marginBottom: 6 }}>Arrêts autorisés</legend>
              <div className="chips">
                {AUTHORIZED_STOP_OPTIONS.map((s) => (
                  <label key={s} className="chip"><input type="checkbox" checked={f.stops.includes(s)} onChange={(e) => update({ stops: e.target.checked ? [...f.stops, s] : f.stops.filter((x) => x !== s) })} />{s}</label>
                ))}
              </div>
            </fieldset>
          </div>
          {buses.every((b) => !busAvailability(b).available) && <Alert kind="warning">Aucun bus disponible. Mettez à jour les documents du parc automobile.</Alert>}
          <div className="form-actions">
            <Link to="/agency/trips" className="btn btn-secondary">Annuler</Link>
            <Button type="submit" variant="primary" loading={busy === 'save'}>Enregistrer le voyage</Button>
          </div>
        </div>
      </form>
    </>
  );
}
