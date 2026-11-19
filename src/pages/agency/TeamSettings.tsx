import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useUser } from '../../auth/AuthContext';
import { useDb } from '../../data/store';
import { roleLabel } from '../../domain/labels';
import { permissionsOf, permissionLabel } from '../../domain/permissions';
import { fmtDateTime } from '../../lib/dates';
import { orgById } from '../../services/queries';
import { requestAccount, updateAgencySettings } from '../../services/api';
import { useAction } from '../../hooks/useAction';
import { DataTable } from '../../components/DataTable';
import { ApprovalBadge, UserStatusBadge } from '../../components/status';
import { Dialog } from '../../components/Dialog';
import { Alert, Button, PageTitle, Panel, SelectField, TextAreaField, TextField } from '../../components/ui';
import type { Role } from '../../domain/types';

export function TeamPage() {
  const user = useUser();
  const db = useDb();
  const { run, busy } = useAction();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', role: 'agency_counter' as Role, note: '' });
  const [err, setErr] = useState<string | null>(null);
  const staff = db.users.filter((u) => u.organizationId === user.organizationId);
  return (
    <>
      <PageTitle title="Équipe de l'agence" lead="Comptes habilités de votre agence. Les comptes sont créés et attribués par l'administration centrale."
        actions={<Button variant="primary" icon={<UserPlus size={18} aria-hidden />} onClick={() => setOpen(true)}>Demander un compte</Button>} />
      <Panel flush>
        <DataTable rows={staff} rowKey={(u) => u.id} caption="Comptes de l'agence"
          columns={[
            { key: 'n', header: 'Nom', render: (u) => <span className="strong">{u.name}</span> },
            { key: 'l', header: 'Identifiant', render: (u) => <span className="mono">{u.login}</span> },
            { key: 'r', header: 'Rôle', render: (u) => roleLabel[u.role] },
            { key: 's', header: 'Statut', render: (u) => <UserStatusBadge s={u.status} /> },
            { key: 'c', header: 'Dernière connexion', render: (u) => <span className="mono">{fmtDateTime(u.lastLoginAt)}</span> },
          ]} />
      </Panel>
      <div style={{ height: 16 }} />
      <div className="grid-3">
        {(['agency_admin', 'agency_counter', 'agency_boarding'] as Role[]).map((r) => (
          <Panel key={r} title={roleLabel[r]}>
            <ul style={{ margin: 0, paddingLeft: 18 }} className="small">{permissionsOf(r).map((p) => <li key={p}>{permissionLabel[p]}</li>)}</ul>
          </Panel>
        ))}
      </div>
      <Dialog open={open} title="Demander un compte" onClose={() => setOpen(false)} description="La demande est transmise à l'administration centrale, qui vérifie et crée le compte."
        footer={<><Button onClick={() => setOpen(false)}>Annuler</Button><Button variant="primary" loading={busy === 'req'} onClick={async () => {
          if (!f.name.trim()) { setErr('Ce champ est obligatoire.'); return; }
          await run('req', () => requestAccount(user, f.name.trim(), f.role, f.note), 'Demande transmise à l’administration centrale.');
          setOpen(false); setF({ name: '', role: 'agency_counter', note: '' });
        }}>Envoyer la demande</Button></>}>
        <TextField label="Nom de la personne" required value={f.name} onChange={(e) => { setF({ ...f, name: e.target.value }); setErr(null); }} error={err} />
        <SelectField label="Rôle souhaité" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
          {(['agency_admin', 'agency_counter', 'agency_boarding', 'driver'] as Role[]).map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
        </SelectField>
        <TextAreaField label="Précisions" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </Dialog>
    </>
  );
}

export function AgencySettingsPage() {
  const user = useUser();
  const db = useDb();
  const { run, busy } = useAction();
  const org = orgById(db, user.organizationId)!;
  const [deadline, setDeadline] = useState(String(org.provisionalDeadlineMinutes ?? 60));
  const n = Number(deadline);
  const invalid = !Number.isInteger(n) || n < 15 || n > 240;
  return (
    <>
      <PageTitle title="Paramètres de l'agence" />
      <div className="grid-2">
        <Panel title="Profil de l'agence">
          <dl className="dl">
            <dt>Nom</dt><dd>{org.name}</dd>
            <dt>Pays</dt><dd>{org.country === 'TG' ? 'Togo' : 'Bénin'}</dd>
            <dt>Ville</dt><dd>{org.city}</dd>
            <dt>Agrément</dt><dd><ApprovalBadge s={org.approvalStatus} /></dd>
            <dt>Contact</dt><dd>{org.contactName}<br /><span className="small muted">{org.contactEmail} · {org.contactPhone}</span></dd>
          </dl>
          <p className="small muted" style={{ marginTop: 12 }}>Toute modification du profil ou de l'agrément passe par l'administration centrale.</p>
        </Panel>
        <Panel title="Liste provisoire">
          <form className="stack" onSubmit={(e) => { e.preventDefault(); if (!invalid) void run('s', () => updateAgencySettings(user, n), 'Votre modification a été enregistrée.'); }}>
            <TextField label="Échéance de la liste provisoire (minutes avant le départ)" type="number" min={15} max={240} value={deadline} onChange={(e) => setDeadline(e.target.value)} error={invalid ? 'Saisissez une valeur entre 15 et 240 minutes.' : null} help="La liste provisoire est préparée lorsque le bus est complet ou à cette échéance." />
            <div className="form-actions"><Button type="submit" variant="primary" loading={busy === 's'} disabled={invalid}>Enregistrer</Button></div>
          </form>
        </Panel>
      </div>
      <div style={{ height: 16 }} />
      <Alert kind="neutral" title="Conservation des données (règles proposées)">Photos et manifestes : {db.settings.retentionManifestHours} h après le passage de la frontière. Profils : {db.settings.retentionProfileMonths} mois après le dernier voyage, avec accord. Journal : {db.settings.retentionAuditYears} ans. Ces règles doivent être validées juridiquement (IPDCP, APDP) avant toute mise en production.</Alert>
    </>
  );
}
