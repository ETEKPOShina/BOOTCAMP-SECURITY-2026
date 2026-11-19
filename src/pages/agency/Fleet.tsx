import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Plus, Pencil } from 'lucide-react';
import { useUser } from '../../auth/AuthContext';
import { useDb } from '../../data/store';
import { can } from '../../domain/permissions';
import { busAvailability, busDocState, busDocuments, driverAvailability, driverDocState, driverDocuments, docStateLabel, expiryState, type DocState } from '../../domain/documents';
import { daysUntil, dateOffset, fmtDate } from '../../lib/dates';
import { agencyBuses, agencyDrivers, busById, orgById } from '../../services/queries';
import { upsertBus, upsertDriver } from '../../services/api';
import { useAction } from '../../hooks/useAction';
import { DataTable } from '../../components/DataTable';
import { DocBadge, StatusBadge } from '../../components/status';
import { Dialog } from '../../components/Dialog';
import { Button, FilterBar, FilterSelect, PageTitle, Panel, SearchField, SelectField, TextField } from '../../components/ui';
import type { Bus, Driver } from '../../domain/types';

type Tab = 'buses' | 'drivers' | 'documents';

function Availability({ a }: { a: { available: boolean; reason: string } }) {
  return a.available ? <StatusBadge tone="green">Disponible</StatusBadge> : <span title={a.reason}><StatusBadge tone="red">Indisponible</StatusBadge><br /><span className="small muted">{a.reason}</span></span>;
}

type BusForm = Omit<Bus, 'agencyId' | 'id'> & { id?: string };
type DriverForm = Omit<Driver, 'agencyId' | 'id'> & { id?: string };

const emptyBus = (): BusForm => ({ registration: '', vehicleIdentifier: '', capacity: 56, registrationDocumentRef: '', registrationDocumentStatus: 'to_check', inspectionExpiry: dateOffset(180), insuranceExpiry: dateOffset(180), brownCardExpiry: dateOffset(180), status: 'active' });
const emptyDriver = (): DriverForm => ({ name: '', phone: '', email: '', identityDocumentRef: '', identityDocumentExpiry: dateOffset(365), licenceReference: '', licenceExpiry: dateOffset(365), professionalCardReference: '', professionalCardExpiry: dateOffset(365), assignedBusId: null, status: 'active' });

/** Parc automobile. `global` : vue de l'administration centrale (lecture seule, toutes agences). */
export function FleetPage({ global = false }: { global?: boolean }) {
  const user = useUser();
  const db = useDb();
  const loc = useLocation();
  const { run, busy } = useAction();
  const tab: Tab = loc.pathname.endsWith('/buses') ? 'buses' : loc.pathname.endsWith('/drivers') ? 'drivers' : 'documents';
  const base = global ? '/admin/fleet' : '/agency/fleet';
  const buses = global ? db.buses : agencyBuses(db, user);
  const drivers = global ? db.drivers : agencyDrivers(db, user);
  const canManage = !global && can(user, 'agency.fleet.manage');
  const [q, setQ] = useState('');
  const [state, setState] = useState('all');
  const [busForm, setBusForm] = useState<BusForm | null>(null);
  const [drvForm, setDrvForm] = useState<DriverForm | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const docRows = useMemo(() => [
    ...buses.flatMap((b) => busDocuments(b).map((d) => ({ id: `${b.id}-${d.label}`, owner: b.registration, kind: 'Bus', agencyId: b.agencyId, ...d }))),
    ...drivers.flatMap((dr) => driverDocuments(dr).map((d) => ({ id: `${dr.id}-${d.label}`, owner: dr.name, kind: 'Chauffeur', agencyId: dr.agencyId, ...d }))),
  ].filter((d) => (state === 'all' || d.state === state) && (!q.trim() || `${d.owner} ${d.label} ${d.ref}`.toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => ['expired', 'to_check', 'expiring', 'valid'].indexOf(a.state) - ['expired', 'to_check', 'expiring', 'valid'].indexOf(b.state)), [buses, drivers, state, q]);

  const busRows = buses.filter((b) => (!q.trim() || `${b.registration} ${b.vehicleIdentifier}`.toLowerCase().includes(q.trim().toLowerCase())) && (state === 'all' || busDocState(b) === state));
  const drvRows = drivers.filter((d) => (!q.trim() || d.name.toLowerCase().includes(q.trim().toLowerCase())) && (state === 'all' || driverDocState(d) === state));

  const saveBus = async () => {
    if (!busForm) return;
    const e: Record<string, string> = {};
    if (!busForm.registration.trim()) e.registration = 'Ce champ est obligatoire.';
    if (!busForm.vehicleIdentifier.trim()) e.vehicleIdentifier = 'Ce champ est obligatoire.';
    if (!Number.isInteger(busForm.capacity) || busForm.capacity < 10 || busForm.capacity > 90) e.capacity = 'Capacité entre 10 et 90 places.';
    for (const k of ['inspectionExpiry', 'insuranceExpiry', 'brownCardExpiry'] as const) if (!busForm[k]) e[k] = 'Ce champ est obligatoire.';
    setErrors(e);
    if (Object.keys(e).length) return;
    const r = await run('bus', () => upsertBus(user, { ...busForm, registration: busForm.registration.trim().toUpperCase() }), 'Votre modification a été enregistrée.');
    if (r) setBusForm(null);
  };
  const saveDriver = async () => {
    if (!drvForm) return;
    const e: Record<string, string> = {};
    for (const k of ['name', 'phone', 'identityDocumentRef', 'licenceReference', 'professionalCardReference'] as const) if (!drvForm[k].trim()) e[k] = 'Ce champ est obligatoire.';
    for (const k of ['identityDocumentExpiry', 'licenceExpiry', 'professionalCardExpiry'] as const) if (!drvForm[k]) e[k] = 'Ce champ est obligatoire.';
    setErrors(e);
    if (Object.keys(e).length) return;
    const r = await run('drv', () => upsertDriver(user, drvForm), 'Votre modification a été enregistrée.');
    if (r) setDrvForm(null);
  };
  const expHelp = (d: string) => (d ? `${docStateLabel[expiryState(d)]}${daysUntil(d) >= 0 ? ` — ${daysUntil(d)} jour(s)` : ''}` : undefined);

  return (
    <>
      <PageTitle title="Parc automobile" lead={global ? 'Conformité des bus et chauffeurs de toutes les agences (lecture seule).' : 'Bus, chauffeurs et documents réglementaires. Avertissement à 30 jours de l’échéance.'}
        actions={canManage && (tab === 'buses' ? <Button variant="primary" icon={<Plus size={18} aria-hidden />} onClick={() => { setErrors({}); setBusForm(emptyBus()); }}>Ajouter un bus</Button> : tab === 'drivers' ? <Button variant="primary" icon={<Plus size={18} aria-hidden />} onClick={() => { setErrors({}); setDrvForm(emptyDriver()); }}>Ajouter un chauffeur</Button> : undefined)} />
      <nav className="tabs" aria-label="Sections du parc automobile">
        <Link to={`${base}/buses`} className={tab === 'buses' ? 'active' : ''} aria-current={tab === 'buses' ? 'page' : undefined}>Bus ({buses.length})</Link>
        <Link to={`${base}/drivers`} className={tab === 'drivers' ? 'active' : ''} aria-current={tab === 'drivers' ? 'page' : undefined}>Chauffeurs ({drivers.length})</Link>
        <Link to={base} className={tab === 'documents' ? 'active' : ''} aria-current={tab === 'documents' ? 'page' : undefined}>Documents</Link>
      </nav>
      <Panel flush>
        <FilterBar>
          <SearchField label="Rechercher" value={q} onChange={setQ} placeholder={tab === 'drivers' ? 'Nom du chauffeur…' : tab === 'buses' ? 'Immatriculation…' : 'Bus, chauffeur, document…'} />
          <FilterSelect label="État des documents" value={state} onChange={setState} options={[{ value: 'all', label: 'Tous' }, ...(Object.keys(docStateLabel) as DocState[]).map((s) => ({ value: s, label: docStateLabel[s] }))]} />
        </FilterBar>
        {tab === 'buses' && (
          <DataTable rows={busRows} rowKey={(b) => b.id} caption="Bus" empty="Aucun bus."
            columns={[
              { key: 'r', header: 'Immatriculation', render: (b) => <span className="mono strong">{b.registration}</span> },
              { key: 'v', header: 'Identifiant véhicule', render: (b) => b.vehicleIdentifier },
              { key: 'c', header: 'Capacité', render: (b) => `${b.capacity} places`, className: 'num' },
              ...(global ? [{ key: 'a', header: 'Agence', render: (b: Bus) => orgById(db, b.agencyId)?.name }] : []),
              { key: 'd', header: 'Documents', render: (b) => <DocBadge s={busDocState(b)} /> },
              { key: 'av', header: 'Disponibilité', render: (b) => <Availability a={busAvailability(b)} /> },
              ...(canManage ? [{ key: 'e', header: 'Action', render: (b: Bus) => <Button size="sm" variant="ghost" icon={<Pencil size={14} aria-hidden />} onClick={() => { setErrors({}); setBusForm({ ...b }); }}>Modifier</Button> }] : []),
            ]} />
        )}
        {tab === 'drivers' && (
          <DataTable rows={drvRows} rowKey={(d) => d.id} caption="Chauffeurs" empty="Aucun chauffeur."
            columns={[
              { key: 'n', header: 'Nom complet', render: (d) => <span className="strong">{d.name}</span> },
              ...(global ? [{ key: 'a', header: 'Agence', render: (d: Driver) => orgById(db, d.agencyId)?.name }] : []),
              { key: 'b', header: 'Bus attribué', render: (d) => <span className="mono">{d.assignedBusId ? busById(db, d.assignedBusId)?.registration : '—'}</span> },
              { key: 'l', header: 'Permis', render: (d) => <DocBadge s={expiryState(d.licenceExpiry)} /> },
              { key: 'p', header: 'Carte professionnelle', render: (d) => <DocBadge s={expiryState(d.professionalCardExpiry)} /> },
              { key: 'av', header: 'Disponibilité', render: (d) => <Availability a={driverAvailability(d)} /> },
              ...(canManage ? [{ key: 'e', header: 'Action', render: (d: Driver) => <Button size="sm" variant="ghost" icon={<Pencil size={14} aria-hidden />} onClick={() => { setErrors({}); setDrvForm({ ...d }); }}>Modifier</Button> }] : []),
            ]} />
        )}
        {tab === 'documents' && (
          <DataTable rows={docRows} rowKey={(d) => d.id} caption="Documents réglementaires" empty="Aucun document pour ce filtre." pageSize={20}
            columns={[
              { key: 'o', header: 'Titulaire', render: (d) => <span><span className="strong">{d.owner}</span><br /><span className="small muted">{d.kind}{global ? ` · ${orgById(db, d.agencyId)?.name}` : ''}</span></span> },
              { key: 'l', header: 'Document', render: (d) => d.label },
              { key: 'r', header: 'Référence', render: (d) => <span className="mono">{d.ref || '—'}</span> },
              { key: 'e', header: 'Échéance', render: (d) => (d.expiry ? <span className="mono">{fmtDate(d.expiry)}<span className="small muted"> ({daysUntil(d.expiry)} j)</span></span> : '—') },
              { key: 's', header: 'État', render: (d) => <DocBadge s={d.state} /> },
            ]} />
        )}
      </Panel>

      <Dialog open={!!busForm} wide title={busForm?.id ? 'Modifier le bus' : 'Ajouter un bus'} onClose={() => setBusForm(null)}
        footer={<><Button onClick={() => setBusForm(null)}>Annuler</Button><Button variant="primary" loading={busy === 'bus'} onClick={saveBus}>Enregistrer</Button></>}>
        {busForm && (
          <div className="form-grid">
            <TextField label="Immatriculation" required value={busForm.registration} onChange={(e) => setBusForm({ ...busForm, registration: e.target.value })} error={errors.registration} />
            <TextField label="Identifiant véhicule" required value={busForm.vehicleIdentifier} onChange={(e) => setBusForm({ ...busForm, vehicleIdentifier: e.target.value })} error={errors.vehicleIdentifier} />
            <TextField label="Nombre de places" type="number" required value={String(busForm.capacity)} onChange={(e) => setBusForm({ ...busForm, capacity: Number(e.target.value) })} error={errors.capacity} />
            <SelectField label="État du véhicule" value={busForm.status} onChange={(e) => setBusForm({ ...busForm, status: e.target.value as Bus['status'] })}><option value="active">En service</option><option value="maintenance">En maintenance</option></SelectField>
            <TextField label="Certificat d'immatriculation (référence)" value={busForm.registrationDocumentRef} onChange={(e) => setBusForm({ ...busForm, registrationDocumentRef: e.target.value })} />
            <SelectField label="Certificat d'immatriculation (état)" value={busForm.registrationDocumentStatus} onChange={(e) => setBusForm({ ...busForm, registrationDocumentStatus: e.target.value as Bus['registrationDocumentStatus'] })}><option value="valid">Valide</option><option value="to_check">À vérifier</option></SelectField>
            <TextField label="Expiration de la visite technique" type="date" required value={busForm.inspectionExpiry} onChange={(e) => setBusForm({ ...busForm, inspectionExpiry: e.target.value })} error={errors.inspectionExpiry} help={expHelp(busForm.inspectionExpiry)} />
            <TextField label="Expiration de l'assurance" type="date" required value={busForm.insuranceExpiry} onChange={(e) => setBusForm({ ...busForm, insuranceExpiry: e.target.value })} error={errors.insuranceExpiry} help={expHelp(busForm.insuranceExpiry)} />
            <TextField label="Expiration de la carte brune CEDEAO" type="date" required value={busForm.brownCardExpiry} onChange={(e) => setBusForm({ ...busForm, brownCardExpiry: e.target.value })} error={errors.brownCardExpiry} help={expHelp(busForm.brownCardExpiry)} />
          </div>
        )}
      </Dialog>
      <Dialog open={!!drvForm} wide title={drvForm?.id ? 'Modifier le chauffeur' : 'Ajouter un chauffeur'} onClose={() => setDrvForm(null)}
        footer={<><Button onClick={() => setDrvForm(null)}>Annuler</Button><Button variant="primary" loading={busy === 'drv'} onClick={saveDriver}>Enregistrer</Button></>}>
        {drvForm && (
          <div className="form-grid">
            <TextField label="Nom complet" required value={drvForm.name} onChange={(e) => setDrvForm({ ...drvForm, name: e.target.value })} error={errors.name} />
            <TextField label="Téléphone" required value={drvForm.phone} onChange={(e) => setDrvForm({ ...drvForm, phone: e.target.value })} error={errors.phone} />
            <TextField label="E-mail" type="email" value={drvForm.email} onChange={(e) => setDrvForm({ ...drvForm, email: e.target.value })} />
            <SelectField label="Bus attribué" value={drvForm.assignedBusId ?? ''} onChange={(e) => setDrvForm({ ...drvForm, assignedBusId: e.target.value || null })}><option value="">Aucun</option>{buses.map((b) => <option key={b.id} value={b.id}>{b.registration}</option>)}</SelectField>
            <TextField label="Pièce d'identité (référence)" required value={drvForm.identityDocumentRef} onChange={(e) => setDrvForm({ ...drvForm, identityDocumentRef: e.target.value })} error={errors.identityDocumentRef} />
            <TextField label="Expiration de la pièce d'identité" type="date" required value={drvForm.identityDocumentExpiry} onChange={(e) => setDrvForm({ ...drvForm, identityDocumentExpiry: e.target.value })} error={errors.identityDocumentExpiry} help={expHelp(drvForm.identityDocumentExpiry)} />
            <TextField label="Permis de conduire (référence)" required value={drvForm.licenceReference} onChange={(e) => setDrvForm({ ...drvForm, licenceReference: e.target.value })} error={errors.licenceReference} />
            <TextField label="Expiration du permis" type="date" required value={drvForm.licenceExpiry} onChange={(e) => setDrvForm({ ...drvForm, licenceExpiry: e.target.value })} error={errors.licenceExpiry} help={expHelp(drvForm.licenceExpiry)} />
            <TextField label="Carte professionnelle (référence)" required value={drvForm.professionalCardReference} onChange={(e) => setDrvForm({ ...drvForm, professionalCardReference: e.target.value })} error={errors.professionalCardReference} />
            <TextField label="Expiration de la carte professionnelle" type="date" required value={drvForm.professionalCardExpiry} onChange={(e) => setDrvForm({ ...drvForm, professionalCardExpiry: e.target.value })} error={errors.professionalCardExpiry} help={expHelp(drvForm.professionalCardExpiry)} />
            <SelectField label="Statut" value={drvForm.status} onChange={(e) => setDrvForm({ ...drvForm, status: e.target.value as Driver['status'] })}><option value="active">Actif</option><option value="inactive">Inactif</option></SelectField>
          </div>
        )}
      </Dialog>
    </>
  );
}
