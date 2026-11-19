import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, PauseCircle, XCircle, UserPlus, KeyRound, Radar, Building2, ShieldCheck, Plus, RotateCcw } from 'lucide-react';
import { useUser } from '../../auth/AuthContext';
import { useDb, resetDb } from '../../data/store';
import { ALL_PERMISSIONS, permissionLabel, permissionsOf, rolesForOrgType, workspaceLabel, workspaceOf } from '../../domain/permissions';
import { authorityLabel, orgTypeLabel, roleLabel, countryLabel } from '../../domain/labels';
import { busDocState, driverDocState } from '../../domain/documents';
import { fmtDate, fmtDateTime, fmtTime, isSameDay } from '../../lib/dates';
import { useNetwork, setSimulatedOffline } from '../../lib/network';
import { activePts, auditFor, busById, driverById, manifestsOfTrip, orgById } from '../../services/queries';
import { createAccount, createOrganization, expectedOnBoard, setAgencyApproval, updateAccessRequest, updateAccount, updateSettings } from '../../services/api';
import { useAction } from '../../hooks/useAction';
import { useToast } from '../../components/Toast';
import { DataTable } from '../../components/DataTable';
import { ApprovalBadge, DirectionLabel, RecipientBadge, StatusBadge, TripStatusBadge, UserStatusBadge } from '../../components/status';
import { AuditTable, EventTimeline, ManifestSummary, RouteProgress, TripProgress } from '../../components/domain';
import { ConfirmationDialog, Dialog } from '../../components/Dialog';
import { Alert, Button, ErrorState, FilterBar, FilterSelect, Kpi, PageTitle, Panel, SearchField, SelectField, TextField } from '../../components/ui';
import type { Organization, OrgType, Role, User } from '../../domain/types';

// ------------------------------------------------ tableau de bord

export function AdminDashboard() {
  const user = useUser();
  const db = useDb();
  const agencies = db.organizations.filter((o) => o.type === 'agency');
  const pending = agencies.filter((o) => ['pending', 'in_review'].includes(o.approvalStatus)).length + db.accessRequests.filter((r) => r.status !== 'closed').length;
  const recips = db.manifests.flatMap((m) => m.recipients);
  const docs = db.buses.filter((b) => busDocState(b) !== 'valid').length + db.drivers.filter((d) => driverDocState(d) !== 'valid').length;
  const audit = auditFor(db, user);
  const accountChanges = audit.filter((l) => l.entityType === 'Compte' || l.entityType === 'Organisation').slice(0, 6);
  return (
    <>
      <PageTitle title="Tableau de bord" lead="Vue globale de la plateforme et du pilote Lomé – Cotonou."
        actions={<>
          <Link to="/admin/agencies" className="btn btn-primary"><Building2 size={18} aria-hidden />Approuver une agence</Link>
          <Link to="/admin/accounts?nouveau=1" className="btn btn-secondary"><UserPlus size={18} aria-hidden />Créer un compte autorisé</Link>
          <Link to="/admin/accounts" className="btn btn-secondary"><KeyRound size={18} aria-hidden />Attribuer un rôle / suspendre</Link>
          <Link to="/admin/live-tracking" className="btn btn-secondary"><Radar size={18} aria-hidden />Suivi global des trajets</Link>
        </>} />
      <div className="kpis">
        <Kpi label="Agences actives" value={agencies.filter((o) => o.approvalStatus === 'approved').length} to="/admin/agencies" />
        <Kpi label="Demandes en attente" value={pending} to="/admin/agencies" tone={pending ? 'attention' : undefined} />
        <Kpi label="Utilisateurs autorisés" value={db.users.filter((u) => u.status === 'active').length} to="/admin/accounts" />
        <Kpi label="Voyages suivis aujourd'hui" value={db.trips.filter((t) => isSameDay(t.scheduledDeparture) && t.status !== 'cancelled').length} to="/admin/trips" />
        <Kpi label="Bus en transit" value={db.trips.filter((t) => ['en_route', 'approaching_border', 'at_border'].includes(t.status)).length} to="/admin/live-tracking" />
        <Kpi label="Manifestes transmis" value={recips.filter((r) => r.sentAt && r.state !== 'failed').length} note="Envois par destinataire (simulés)" />
        <Kpi label="Échecs de transmission" value={recips.filter((r) => r.state === 'failed').length} tone={recips.some((r) => r.state === 'failed') ? 'attention' : undefined} to="/admin/trips" />
        <Kpi label="Documents à surveiller" value={docs} to="/admin/fleet" tone={docs ? 'attention' : undefined} />
      </div>
      <div className="grid-2">
        <Panel title="Modifications récentes des comptes et entités" flush><AuditTable logs={accountChanges} /></Panel>
        <Panel title="Activité récente" flush actions={<Link to="/admin/audit" className="btn btn-ghost btn-sm">Journal complet</Link>}><AuditTable logs={audit.slice(0, 6)} /></Panel>
      </div>
    </>
  );
}

// ------------------------------------------------ agences

export function AdminAgencies() {
  const user = useUser();
  const db = useDb();
  const { run } = useAction();
  const [status, setStatus] = useState('all');
  const agencies = db.organizations.filter((o) => o.type === 'agency' && (status === 'all' || o.approvalStatus === status));
  return (
    <>
      <PageTitle title="Agences de transport" lead="Agrément, suspension et suivi des agences participant au pilote." />
      <Panel title="Demandes d'accès reçues" flush hint="Formulaire public — aucune création de compte automatique">
        <DataTable rows={db.accessRequests} rowKey={(r) => r.id} caption="Demandes d'accès" empty="Aucune demande."
          columns={[
            { key: 'o', header: 'Organisation', render: (r) => <span><span className="strong">{r.organizationName}</span><br /><span className="small muted">{r.organizationType} · {r.country}</span></span> },
            { key: 'c', header: 'Contact', render: (r) => <span>{r.contactName} — {r.contactFunction}<br /><span className="small muted">{r.email} · {r.phone}</span></span> },
            { key: 'm', header: 'Message', render: (r) => <span className="small">{r.message || '—'}</span> },
            { key: 'd', header: 'Reçue le', render: (r) => <span className="mono">{fmtDateTime(r.createdAt)}</span> },
            { key: 's', header: 'Statut', render: (r) => <StatusBadge tone={r.status === 'closed' ? 'neutral' : r.status === 'in_review' ? 'violet' : 'orange'}>{r.status === 'new' ? 'Nouvelle' : r.status === 'in_review' ? 'En cours' : 'Clôturée'}</StatusBadge> },
            { key: 'a', header: 'Actions', render: (r) => r.status === 'closed' ? null : <div className="row" style={{ gap: 4 }}>{r.status === 'new' && <Button size="sm" onClick={() => run('ar', () => updateAccessRequest(user, r.id, 'in_review'), 'Votre modification a été enregistrée.')}>Prendre en charge</Button>}<Button size="sm" variant="ghost" onClick={() => run('ar', () => updateAccessRequest(user, r.id, 'closed'), 'Votre modification a été enregistrée.')}>Clôturer</Button></div> },
          ]} />
      </Panel>
      <div style={{ height: 16 }} />
      <Panel title="Agences" flush>
        <FilterBar><FilterSelect label="Agrément" value={status} onChange={setStatus} options={[{ value: 'all', label: 'Tous' }, { value: 'approved', label: 'Agréée' }, { value: 'pending', label: 'Demande reçue' }, { value: 'in_review', label: 'En cours de vérification' }, { value: 'suspended', label: 'Suspendue' }, { value: 'rejected', label: 'Refusée' }]} /></FilterBar>
        <DataTable rows={agencies} rowKey={(o) => o.id} caption="Agences" empty="Aucune agence."
          columns={[
            { key: 'n', header: 'Agence', render: (o) => <Link to={`/admin/agencies/${o.id}`}>{o.name}</Link> },
            { key: 'c', header: 'Pays', render: (o) => (o.country ? countryLabel[o.country] : '—') },
            { key: 'v', header: 'Ville', render: (o) => o.city ?? '—' },
            { key: 's', header: 'Agrément', render: (o) => <ApprovalBadge s={o.approvalStatus} /> },
            { key: 'b', header: 'Bus', render: (o) => db.buses.filter((b) => b.agencyId === o.id).length, className: 'num' },
            { key: 't', header: 'Voyages', render: (o) => db.trips.filter((t) => t.agencyId === o.id).length, className: 'num' },
            { key: 'u', header: 'Comptes', render: (o) => db.users.filter((u) => u.organizationId === o.id && u.status === 'active').length, className: 'num' },
          ]} />
      </Panel>
    </>
  );
}

export function AdminAgencyDetail() {
  const { id = '' } = useParams();
  const user = useUser();
  const db = useDb();
  const { run, busy } = useAction();
  const [confirm, setConfirm] = useState<null | Organization['approvalStatus']>(null);
  const o = db.organizations.find((x) => x.id === id && x.type === 'agency');
  if (!o) return <ErrorState title="Agence introuvable" action={<Link className="btn btn-secondary" to="/admin/agencies">Agences</Link>} />;
  const labels: Record<string, string> = { approved: 'Accorder l’agrément', suspended: 'Suspendre l’agence', rejected: 'Refuser la demande', in_review: 'Engager la vérification' };
  return (
    <>
      <PageTitle title={o.name} badge={<ApprovalBadge s={o.approvalStatus} />} crumbs={[{ label: 'Agences', to: '/admin/agencies' }, { label: o.name }]}
        actions={<>
          {o.approvalStatus !== 'approved' && o.approvalStatus !== 'rejected' && <Button variant="primary" icon={<CheckCircle2 size={16} aria-hidden />} onClick={() => setConfirm('approved')}>Accorder l'agrément</Button>}
          {o.approvalStatus === 'pending' && <Button onClick={() => setConfirm('in_review')}>Engager la vérification</Button>}
          {o.approvalStatus === 'approved' && <Button variant="danger" icon={<PauseCircle size={16} aria-hidden />} onClick={() => setConfirm('suspended')}>Suspendre l'agence</Button>}
          {['pending', 'in_review'].includes(o.approvalStatus) && <Button variant="ghost" icon={<XCircle size={16} aria-hidden />} onClick={() => setConfirm('rejected')}>Refuser</Button>}
        </>} />
      <div className="grid-2">
        <Panel title="Profil">
          <dl className="dl">
            <dt>Pays</dt><dd>{o.country ? countryLabel[o.country] : '—'}</dd>
            <dt>Ville</dt><dd>{o.city ?? '—'}</dd>
            <dt>Contact</dt><dd>{o.contactName ?? '—'}<br /><span className="small muted">{o.contactEmail} · {o.contactPhone}</span></dd>
            <dt>Créée le</dt><dd>{fmtDate(o.createdAt)}</dd>
            <dt>Liste provisoire</dt><dd>{o.provisionalDeadlineMinutes} min avant le départ</dd>
          </dl>
        </Panel>
        <Panel title="Pièces du dossier" hint="Références fictives">
          {o.documents?.length ? (
            <ul className="notif-list">{o.documents.map((d) => <li key={d.label} className="row" style={{ justifyContent: 'space-between', padding: '8px 0' }}><span>{d.label}</span><StatusBadge tone={d.status === 'provided' ? 'green' : d.status === 'missing' ? 'red' : 'orange'}>{d.status === 'provided' ? 'Fournie' : d.status === 'missing' ? 'Manquante' : 'À vérifier'}</StatusBadge></li>)}</ul>
          ) : <p className="muted">Aucune pièce enregistrée.</p>}
        </Panel>
      </div>
      <div style={{ height: 16 }} />
      <Panel title="Comptes de l'agence" flush actions={<Link className="btn btn-secondary btn-sm" to={`/admin/accounts?nouveau=1&org=${o.id}`}>Créer un compte</Link>}>
        <DataTable rows={db.users.filter((u) => u.organizationId === o.id)} rowKey={(u) => u.id} caption="Comptes de l'agence" empty="Aucun compte."
          columns={[
            { key: 'n', header: 'Nom', render: (u) => <Link to={`/admin/accounts/${u.id}`}>{u.name}</Link> },
            { key: 'r', header: 'Rôle', render: (u) => roleLabel[u.role] },
            { key: 's', header: 'Statut', render: (u) => <UserStatusBadge s={u.status} /> },
          ]} />
      </Panel>
      <ConfirmationDialog open={!!confirm} title={confirm ? labels[confirm] : ''} confirmLabel="Confirmer" danger={confirm === 'suspended' || confirm === 'rejected'} loading={busy === 'ap'}
        message={confirm === 'suspended' ? 'Les comptes de l’agence ne pourront plus se connecter tant que la suspension est active.' : 'La décision est enregistrée dans le journal et notifiée à l’agence.'}
        onClose={() => setConfirm(null)} onConfirm={async () => { await run('ap', () => setAgencyApproval(user, o.id, confirm!), 'Votre modification a été enregistrée.'); setConfirm(null); }} />
    </>
  );
}

// ------------------------------------------------ entités partenaires

export function AdminPartners() {
  const user = useUser();
  const db = useDb();
  const { run, busy } = useAction();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', type: 'police' as OrgType, country: 'TG' as 'TG' | 'BJ', city: '', contactName: '', contactEmail: '', contactPhone: '' });
  const [err, setErr] = useState<string | null>(null);
  const partners = db.organizations.filter((o) => o.type !== 'agency');
  return (
    <>
      <PageTitle title="Entités partenaires" lead="Services de police, postes frontaliers, douanes et administration centrale." actions={<Button variant="primary" icon={<Plus size={18} aria-hidden />} onClick={() => setOpen(true)}>Ajouter une entité</Button>} />
      <Alert kind="warning" title="Aucun partenariat officiel n'est représenté.">Les entités listées sont des organisations de démonstration. Elles ne traduisent ni accord, ni autorisation, ni intégration avec les services réels.</Alert>
      <div style={{ height: 16 }} />
      <Panel flush>
        <DataTable rows={partners} rowKey={(o) => o.id} caption="Entités partenaires"
          columns={[
            { key: 'n', header: 'Entité', render: (o) => <span className="strong">{o.name}</span> },
            { key: 't', header: 'Type', render: (o) => orgTypeLabel[o.type] },
            { key: 'c', header: 'Pays', render: (o) => (o.country ? countryLabel[o.country] : 'Les deux') },
            { key: 'u', header: 'Comptes actifs', render: (o) => db.users.filter((u) => u.organizationId === o.id && u.status === 'active').length, className: 'num' },
            { key: 's', header: 'Statut', render: (o) => <ApprovalBadge s={o.approvalStatus} /> },
            { key: 'a', header: 'Action', render: (o) => <Link className="btn btn-ghost btn-sm" to={`/admin/accounts?org=${o.id}`}>Comptes</Link> },
          ]} />
      </Panel>
      <Dialog open={open} title="Ajouter une entité" onClose={() => setOpen(false)}
        footer={<><Button onClick={() => setOpen(false)}>Annuler</Button><Button variant="primary" loading={busy === 'org'} onClick={async () => { if (!f.name.trim()) { setErr('Ce champ est obligatoire.'); return; } const r = await run('org', () => createOrganization(user, { ...f, country: f.type === 'central' ? null : f.country }), 'Votre modification a été enregistrée.'); if (r) setOpen(false); }}>Enregistrer</Button></>}>
        <TextField label="Nom de l'entité" required value={f.name} onChange={(e) => { setF({ ...f, name: e.target.value }); setErr(null); }} error={err} />
        <SelectField label="Type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as OrgType })}>{(['police', 'border_post', 'customs', 'agency', 'central'] as OrgType[]).map((t) => <option key={t} value={t}>{orgTypeLabel[t]}</option>)}</SelectField>
        {f.type !== 'central' && <SelectField label="Pays" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value as 'TG' | 'BJ' })}><option value="TG">Togo</option><option value="BJ">Bénin</option></SelectField>}
        <TextField label="Contact" value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} />
      </Dialog>
    </>
  );
}

// ------------------------------------------------ comptes

export function AdminAccounts() {
  const user = useUser();
  const db = useDb();
  const nav = useNavigate();
  const { run, busy } = useAction();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [ws, setWs] = useState('all');
  const orgFilter = params.get('org') ?? 'all';
  const creating = params.get('nouveau') === '1';
  const [f, setF] = useState({ name: '', login: '', email: '', organizationId: params.get('org') ?? '', role: '' as Role | '', driverId: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const org = db.organizations.find((o) => o.id === f.organizationId);
  const roleOptions = org ? rolesForOrgType[org.type] : [];
  const rows = useMemo(() => db.users.filter((u) => {
    const s = q.trim().toLowerCase();
    if (s && !`${u.name} ${u.login} ${u.email}`.toLowerCase().includes(s)) return false;
    if (status !== 'all' && u.status !== status) return false;
    if (ws !== 'all' && workspaceOf(u.role) !== ws) return false;
    if (orgFilter !== 'all' && u.organizationId !== orgFilter) return false;
    return true;
  }), [db.users, q, status, ws, orgFilter]);
  const closeCreate = () => { const p = new URLSearchParams(params); p.delete('nouveau'); setParams(p); setErrors({}); };
  const submit = async () => {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = 'Ce champ est obligatoire.';
    if (!/^[a-z0-9._-]{3,}$/.test(f.login)) e.login = 'Identifiant : 3 caractères minimum (minuscules, chiffres, . _ -).';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = 'Adresse e-mail invalide.';
    if (!f.organizationId) e.organizationId = 'Ce champ est obligatoire.';
    if (!f.role) e.role = 'Ce champ est obligatoire.';
    if (f.role === 'driver' && !f.driverId) e.driverId = 'Associez la fiche chauffeur.';
    setErrors(e);
    if (Object.keys(e).length) return;
    const u = await run('create', () => createAccount(user, { name: f.name.trim(), login: f.login, email: f.email, role: f.role as Role, organizationId: f.organizationId, driverId: f.role === 'driver' ? f.driverId : undefined }), (x) => `Compte « ${x.login} » créé. Mot de passe de démonstration : celui indiqué sur la page de connexion.`);
    if (u) { closeCreate(); nav(`/admin/accounts/${u.id}`); }
  };
  return (
    <>
      <PageTitle title="Comptes autorisés" lead="Création, attribution des rôles, suspension et révocation. Aucune inscription publique n'est possible."
        actions={<Button variant="primary" icon={<UserPlus size={18} aria-hidden />} onClick={() => { const p = new URLSearchParams(params); p.set('nouveau', '1'); setParams(p); }}>Créer un compte</Button>} />
      <Panel flush>
        <FilterBar>
          <SearchField label="Rechercher un compte" value={q} onChange={setQ} placeholder="Nom, identifiant, e-mail…" />
          <FilterSelect label="Espace" value={ws} onChange={setWs} options={[{ value: 'all', label: 'Tous' }, ...Object.entries(workspaceLabel).map(([value, label]) => ({ value, label }))]} />
          <FilterSelect label="Organisation" value={orgFilter} onChange={(v) => { const p = new URLSearchParams(params); if (v === 'all') p.delete('org'); else p.set('org', v); setParams(p); }} options={[{ value: 'all', label: 'Toutes' }, ...db.organizations.map((o) => ({ value: o.id, label: o.name }))]} />
          <FilterSelect label="Statut" value={status} onChange={setStatus} options={[{ value: 'all', label: 'Tous' }, { value: 'active', label: 'Actif' }, { value: 'suspended', label: 'Suspendu' }, { value: 'revoked', label: 'Révoqué' }]} />
        </FilterBar>
        <DataTable rows={rows} rowKey={(u) => u.id} caption="Comptes" empty="Aucun compte pour ces critères." pageSize={15}
          columns={[
            { key: 'n', header: 'Nom', render: (u) => <Link to={`/admin/accounts/${u.id}`}>{u.name}</Link> },
            { key: 'l', header: 'Identifiant', render: (u) => <span className="mono">{u.login}</span> },
            { key: 'o', header: 'Organisation', render: (u) => orgById(db, u.organizationId)?.name },
            { key: 'r', header: 'Rôle', render: (u) => roleLabel[u.role] },
            { key: 's', header: 'Statut', render: (u) => <UserStatusBadge s={u.status} /> },
            { key: 'c', header: 'Dernière connexion', render: (u) => <span className="mono">{fmtDateTime(u.lastLoginAt)}</span> },
          ]} />
      </Panel>
      <Dialog open={creating} wide title="Créer un compte autorisé" onClose={closeCreate}
        footer={<><Button onClick={closeCreate}>Annuler</Button><Button variant="primary" loading={busy === 'create'} onClick={submit}>Créer le compte</Button></>}>
        <div className="form-grid">
          <TextField label="Nom complet" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={errors.name} />
          <TextField label="Identifiant professionnel" required value={f.login} onChange={(e) => setF({ ...f, login: e.target.value.toLowerCase() })} error={errors.login} />
          <TextField label="Adresse e-mail professionnelle" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={errors.email} />
          <SelectField label="Organisation" required value={f.organizationId} onChange={(e) => setF({ ...f, organizationId: e.target.value, role: '', driverId: '' })} error={errors.organizationId}>
            <option value="">Sélectionner…</option>
            {db.organizations.filter((o) => o.approvalStatus === 'approved' || o.type !== 'agency').map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </SelectField>
          <SelectField label="Rôle" required value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })} error={errors.role} disabled={!org} help={!org ? "Choisissez d'abord l'organisation." : 'Seuls les rôles compatibles avec ce type d’organisation sont proposés.'}>
            <option value="">Sélectionner…</option>
            {roleOptions.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
          </SelectField>
          {f.role === 'driver' && (
            <SelectField label="Fiche chauffeur" required value={f.driverId} onChange={(e) => setF({ ...f, driverId: e.target.value })} error={errors.driverId}>
              <option value="">Sélectionner…</option>
              {db.drivers.filter((d) => d.agencyId === f.organizationId && !db.users.some((u) => u.driverId === d.id)).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </SelectField>
          )}
        </div>
        <Alert kind="neutral">Démonstration : aucun e-mail d'activation n'est envoyé. En production, l'activation et le mot de passe initial suivront une procédure sécurisée.</Alert>
      </Dialog>
    </>
  );
}

export function AdminAccountDetail() {
  const { id = '' } = useParams();
  const user = useUser();
  const db = useDb();
  const { run, busy } = useAction();
  const [confirm, setConfirm] = useState<null | User['status']>(null);
  const u = db.users.find((x) => x.id === id);
  const [role, setRole] = useState<Role | ''>('');
  if (!u) return <ErrorState title="Compte introuvable" action={<Link className="btn btn-secondary" to="/admin/accounts">Comptes</Link>} />;
  const org = orgById(db, u.organizationId);
  const options = org ? rolesForOrgType[org.type].filter((r) => r !== 'driver' || u.driverId) : [];
  const logs = auditFor(db, user).filter((l) => l.userId === u.id || l.entityId === u.login).slice(0, 30);
  return (
    <>
      <PageTitle title={u.name} badge={<UserStatusBadge s={u.status} />} crumbs={[{ label: 'Comptes', to: '/admin/accounts' }, { label: u.login }]}
        actions={u.status !== 'revoked' && u.id !== user.id && <>
          {u.status === 'active' ? <Button icon={<PauseCircle size={16} aria-hidden />} onClick={() => setConfirm('suspended')}>Suspendre le compte</Button> : <Button variant="primary" icon={<CheckCircle2 size={16} aria-hidden />} onClick={() => setConfirm('active')}>Réactiver le compte</Button>}
          <Button variant="danger" icon={<XCircle size={16} aria-hidden />} onClick={() => setConfirm('revoked')}>Révoquer</Button>
        </>} />
      <div className="grid-2">
        <Panel title="Compte">
          <dl className="dl">
            <dt>Identifiant</dt><dd className="mono">{u.login}</dd>
            <dt>E-mail</dt><dd>{u.email}</dd>
            <dt>Organisation</dt><dd>{org?.name}</dd>
            <dt>Espace</dt><dd>{workspaceLabel[workspaceOf(u.role)]}</dd>
            <dt>Rôle</dt><dd>{roleLabel[u.role]}</dd>
            {u.driverId && <><dt>Fiche chauffeur</dt><dd>{driverById(db, u.driverId)?.name}</dd></>}
            <dt>Créé le</dt><dd>{fmtDate(u.createdAt)}</dd>
            <dt>Dernière connexion</dt><dd>{fmtDateTime(u.lastLoginAt)}</dd>
          </dl>
        </Panel>
        <Panel title="Attribution du rôle">
          {u.status === 'revoked' ? <p className="muted">Compte révoqué : aucune modification possible.</p> : (
            <div className="stack">
              <SelectField label="Rôle" value={role || u.role} onChange={(e) => setRole(e.target.value as Role)}>{options.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}</SelectField>
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{permissionsOf((role || u.role) as Role).map((p) => <li key={p}>{permissionLabel[p]}</li>)}</ul>
              <div className="form-actions"><Button variant="primary" disabled={!role || role === u.role} loading={busy === 'role'} onClick={async () => { await run('role', () => updateAccount(user, u.id, { role: role as Role }), 'Votre modification a été enregistrée.'); setRole(''); }}>Attribuer le rôle</Button></div>
            </div>
          )}
        </Panel>
      </div>
      <div style={{ height: 16 }} />
      <Panel title="Activité liée au compte" flush><AuditTable logs={logs} /></Panel>
      <ConfirmationDialog open={!!confirm} title={confirm === 'suspended' ? 'Suspendre ce compte ?' : confirm === 'revoked' ? 'Révoquer ce compte ?' : 'Réactiver ce compte ?'} confirmLabel="Confirmer" danger={confirm !== 'active'} loading={busy === 'st'}
        message={confirm === 'revoked' ? 'La révocation est définitive. Les sessions en cours sont fermées immédiatement.' : confirm === 'suspended' ? 'La personne ne pourra plus se connecter. Les sessions en cours sont fermées immédiatement.' : 'La personne pourra de nouveau se connecter.'}
        onClose={() => setConfirm(null)} onConfirm={async () => { await run('st', () => updateAccount(user, u.id, { status: confirm! }), 'Votre modification a été enregistrée.'); setConfirm(null); }} />
    </>
  );
}

export function AdminRoles() {
  const roles: Role[] = ['agency_admin', 'agency_counter', 'agency_boarding', 'driver', 'police_officer', 'border_officer', 'customs_officer', 'central_admin'];
  return (
    <>
      <PageTitle title="Rôles et habilitations" lead="Matrice des permissions appliquée par la couche de service du prototype (principe du moindre privilège)." />
      <Alert kind="info">L'administration centrale ne dispose d'aucun accès aux documents d'identité chiffrés, aux résultats nominatifs de vérification police ni aux fichiers de police : seulement à des totaux agrégés.</Alert>
      <div style={{ height: 16 }} />
      <Panel flush>
        <div className="table-wrap">
          <table className="data">
            <caption className="sr-only">Matrice des habilitations par rôle</caption>
            <thead><tr><th scope="col">Habilitation</th>{roles.map((r) => <th key={r} scope="col" style={{ whiteSpace: 'normal', minWidth: 90 }}>{roleLabel[r]}</th>)}</tr></thead>
            <tbody>
              {ALL_PERMISSIONS.map((p) => (
                <tr key={p}>
                  <th scope="row" style={{ background: 'transparent', color: 'inherit', fontWeight: 500, whiteSpace: 'normal', fontSize: 13 }}>{permissionLabel[p]}</th>
                  {roles.map((r) => <td key={r} style={{ textAlign: 'center' }}>{permissionsOf(r).includes(p) ? <><ShieldCheck size={16} color="var(--wz-green-ink)" aria-hidden /><span className="sr-only">Oui</span></> : <span className="muted" aria-label="Non">—</span>}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

// ------------------------------------------------ voyages (global, sans données nominatives)

export function AdminTrips() {
  const db = useDb();
  const [q, setQ] = useState('');
  const [agency, setAgency] = useState('all');
  const [issue, setIssue] = useState('all');
  const rows = db.trips.filter((t) => {
    const s = q.trim().toLowerCase();
    if (s && !`${t.reference} ${busById(db, t.busId)?.registration}`.toLowerCase().includes(s)) return false;
    if (agency !== 'all' && t.agencyId !== agency) return false;
    const ms = manifestsOfTrip(db, t.id);
    if (issue === 'failed' && !ms.some((m) => m.recipients.some((r) => r.state === 'failed'))) return false;
    if (issue === 'discrepancy' && !(['TG', 'BJ'] as const).some((c) => t.border[c].actualCount !== null && t.border[c].actualCount !== expectedOnBoard(db, t))) return false;
    return true;
  }).sort((a, b) => b.scheduledDeparture.localeCompare(a.scheduledDeparture));
  return (
    <>
      <PageTitle title="Voyages" lead="Supervision globale des voyages. Aucune donnée nominative des passagers n'est affichée dans cet espace." />
      <Panel flush>
        <FilterBar>
          <SearchField label="Rechercher" value={q} onChange={setQ} placeholder="Référence, immatriculation…" />
          <FilterSelect label="Agence" value={agency} onChange={setAgency} options={[{ value: 'all', label: 'Toutes' }, ...db.organizations.filter((o) => o.type === 'agency').map((o) => ({ value: o.id, label: o.name }))]} />
          <FilterSelect label="Signalement" value={issue} onChange={setIssue} options={[{ value: 'all', label: 'Tous les voyages' }, { value: 'failed', label: 'Échec de transmission' }, { value: 'discrepancy', label: 'Écart de comptage' }]} />
        </FilterBar>
        <DataTable rows={rows} rowKey={(t) => t.id} caption="Voyages" empty="Aucun voyage."
          columns={[
            { key: 'r', header: 'Voyage', render: (t) => <Link className="mono" to={`/admin/trips/${t.id}`}>{t.reference}</Link> },
            { key: 'a', header: 'Agence', render: (t) => orgById(db, t.agencyId)?.name },
            { key: 'd', header: 'Départ', render: (t) => <span className="mono nowrap">{fmtDate(t.scheduledDeparture)} {fmtTime(t.scheduledDeparture)}</span> },
            { key: 's', header: 'Sens', render: (t) => <DirectionLabel d={t.direction} /> },
            { key: 'p', header: 'Passagers', render: (t) => activePts(db, t.id).length, className: 'num' },
            { key: 'st', header: 'Statut', render: (t) => <TripStatusBadge s={t.status} /> },
            { key: 'm', header: 'Dernier manifeste', render: (t) => { const ms = manifestsOfTrip(db, t.id); const m = ms[ms.length - 1]; return m ? <span className="row" style={{ gap: 4 }}>{m.recipients.map((r) => <span key={r.authority} title={authorityLabel[r.authority]}><RecipientBadge s={r.state} /></span>)}</span> : '—'; } },
          ]} />
      </Panel>
    </>
  );
}

export function AdminTripDetail() {
  const { id = '' } = useParams();
  const db = useDb();
  const t = db.trips.find((x) => x.id === id);
  if (!t) return <ErrorState title="Voyage introuvable" action={<Link className="btn btn-secondary" to="/admin/trips">Voyages</Link>} />;
  const pts = activePts(db, t.id);
  return (
    <>
      <PageTitle title={t.reference} badge={<TripStatusBadge s={t.status} />} crumbs={[{ label: 'Voyages', to: '/admin/trips' }, { label: t.reference }]}
        lead={<>{orgById(db, t.agencyId)?.name} · <DirectionLabel d={t.direction} /> · {busById(db, t.busId)?.registration} · {driverById(db, t.driverId)?.name}</>} />
      <Panel title="Progression"><TripProgress trip={t} /></Panel>
      <div style={{ height: 16 }} />
      <div className="grid-main-side">
        <div className="stack">
          <Panel title="Itinéraire"><RouteProgress trip={t} /></Panel>
          <Panel title="Synthèse (sans données nominatives)">
            <dl className="dl">
              <dt>Passagers inscrits</dt><dd>{pts.length}</dd>
              <dt>Embarqués</dt><dd>{pts.filter((p) => p.boardingStatus === 'boarded').length}</dd>
              <dt>Contrôle classique</dt><dd>{pts.filter((p) => !p.preRegistered).length}</dd>
              <dt>Comptage Sanvee-Condji</dt><dd>{t.border.TG.actualCount ?? '—'}{t.border.TG.completedAt && ` · contrôle à ${fmtTime(t.border.TG.completedAt)}`}</dd>
              <dt>Comptage Hillacondji</dt><dd>{t.border.BJ.actualCount ?? '—'}{t.border.BJ.completedAt && ` · contrôle à ${fmtTime(t.border.BJ.completedAt)}`}</dd>
            </dl>
          </Panel>
          <Panel title="Manifestes"><ManifestSummary manifests={manifestsOfTrip(db, t.id)} /></Panel>
        </div>
        <Panel title="Chronologie"><EventTimeline db={db} tripId={t.id} /></Panel>
      </div>
    </>
  );
}

// ------------------------------------------------ paramètres

export function AdminSettings() {
  const user = useUser();
  const db = useDb();
  const net = useNetwork();
  const toast = useToast();
  const { run, busy } = useAction();
  const [s, setS] = useState({ ...db.settings });
  const [reset, setReset] = useState(false);
  const integrations = [
    ['Modules de vérification police (Togo, Bénin)', 'Non connecté — réponses simulées'],
    ['Messagerie de transmission (RabbitMQ / NATS)', 'Non configurée — transmission simulée'],
    ['Passerelle SMS / USSD', 'Non configurée — envois simulés'],
    ['Suivi GPS et géorepérage', 'Non configuré — positions déclarées'],
    ['Fournisseur de cartes (OpenStreetMap / Mapbox)', 'Non configuré — frise d’itinéraire'],
    ['Lecture MRZ / NFC, biométrie, contrôle du vivant', 'Non configurés — démonstration'],
    ['Stockage objet chiffré des images', 'Non configuré — images non conservées'],
    ['Authentification de production', 'Non configurée — connexion de démonstration'],
  ];
  return (
    <>
      <PageTitle title="Paramètres" lead="Configuration de la plateforme (prototype)." />
      <div className="grid-2">
        <Panel title="Politique de conservation (proposée)" hint="À valider juridiquement — IPDCP (Togo), APDP (Bénin)">
          <form className="stack" onSubmit={(e) => { e.preventDefault(); void run('ret', () => updateSettings(user, { retentionManifestHours: s.retentionManifestHours, retentionProfileMonths: s.retentionProfileMonths, retentionAuditYears: s.retentionAuditYears, privacyPolicyVersion: s.privacyPolicyVersion }), 'Votre modification a été enregistrée.'); }}>
            <TextField label="Suppression des photos et manifestes après le passage (heures)" type="number" min={1} value={String(s.retentionManifestHours)} onChange={(e) => setS({ ...s, retentionManifestHours: Number(e.target.value) })} />
            <TextField label="Conservation des profils après le dernier voyage, avec accord (mois)" type="number" min={0} value={String(s.retentionProfileMonths)} onChange={(e) => setS({ ...s, retentionProfileMonths: Number(e.target.value) })} />
            <TextField label="Conservation du journal d'audit (années)" type="number" min={1} value={String(s.retentionAuditYears)} onChange={(e) => setS({ ...s, retentionAuditYears: Number(e.target.value) })} />
            <TextField label="Version de la politique de confidentialité" value={s.privacyPolicyVersion} onChange={(e) => setS({ ...s, privacyPolicyVersion: e.target.value })} help="Emplacement réservé à la politique définitive approuvée." />
            <Alert kind="warning">Ces valeurs sont des règles proposées par le projet, pas une conformité attestée. Aucune suppression automatique n'est exécutée dans la démonstration.</Alert>
            <div className="form-actions"><Button type="submit" variant="primary" loading={busy === 'ret'}>Enregistrer</Button></div>
          </form>
        </Panel>
        <div className="stack">
          <Panel title="Outils de démonstration">
            <div className="stack">
              <label className="check"><input type="checkbox" checked={db.settings.simulateTransmissionFailure} onChange={(e) => run('fail', () => updateSettings(user, { simulateTransmissionFailure: e.target.checked }), 'Votre modification a été enregistrée.')} /><span><strong>Simuler un échec de transmission vers la Police — Bénin</strong><br /><span className="small muted">Permet de démontrer l'état « Échec de transmission » et le repli sur le contrôle classique.</span></span></label>
              <label className="check"><input type="checkbox" checked={net.simulated} onChange={(e) => { setSimulatedOffline(e.target.checked); toast(e.target.checked ? 'Mode hors ligne simulé activé sur cet appareil.' : 'Connexion rétablie.'); }} /><span><strong>Simuler l'absence de réseau sur cet appareil</strong><br /><span className="small muted">Affecte uniquement ce navigateur.</span></span></label>
              <Button variant="danger" icon={<RotateCcw size={16} aria-hidden />} onClick={() => setReset(true)}>Réinitialiser les données de démonstration</Button>
            </div>
          </Panel>
          <Panel title="Intégrations" hint="Architecture cible proposée — aucune intégration externe n'est active">
            <ul className="notif-list">{integrations.map(([k, v]) => <li key={k} className="row" style={{ justifyContent: 'space-between', padding: '8px 0' }}><span>{k}</span><StatusBadge tone="neutral">{v}</StatusBadge></li>)}</ul>
          </Panel>
        </div>
      </div>
      <ConfirmationDialog open={reset} title="Réinitialiser les données ?" danger confirmLabel="Réinitialiser" message="Toutes les modifications faites dans cette démonstration (dans ce navigateur) seront perdues." onClose={() => setReset(false)} onConfirm={() => { resetDb(); setReset(false); toast('Données de démonstration réinitialisées.'); }} />
    </>
  );
}

