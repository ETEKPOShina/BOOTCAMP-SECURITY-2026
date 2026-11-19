import { useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import { useUser } from '../../auth/AuthContext';
import { useDb } from '../../data/store';
import { can } from '../../domain/permissions';
import { auditFor } from '../../services/queries';
import { AuditTable } from '../../components/domain';
import { FilterBar, FilterSelect, PageTitle, Panel, SearchField } from '../../components/ui';

export function AuditPage({ title = 'Journal des activités' }: { title?: string }) {
  const user = useUser();
  const db = useDb();
  const [q, setQ] = useState('');
  const [outcome, setOutcome] = useState('all');
  const [org, setOrg] = useState('all');
  const logs = auditFor(db, user);
  const orgs = Array.from(new Set(logs.map((l) => l.organizationName)));
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return logs.filter((l) => (outcome === 'all' || l.outcome === outcome) && (org === 'all' || l.organizationName === org) &&
      (!s || `${l.userName} ${l.action} ${l.entityId} ${l.entityType}`.toLowerCase().includes(s)));
  }, [logs, q, outcome, org]);
  return (
    <>
      <PageTitle title={title} lead={<><Lock size={14} aria-hidden style={{ verticalAlign: -2 }} /> Entrées en lecture seule. Conservation proposée : {db.settings.retentionAuditYears} ans (à valider).</>} />
      <Panel flush>
        <FilterBar>
          <SearchField label="Rechercher dans le journal" value={q} onChange={setQ} placeholder="Utilisateur, action, référence…" />
          <FilterSelect label="Résultat" value={outcome} onChange={setOutcome} options={[{ value: 'all', label: 'Tous' }, { value: 'success', label: 'Réussi' }, { value: 'denied', label: 'Refusé' }, { value: 'failure', label: 'Échec' }]} />
          {orgs.length > 1 && <FilterSelect label="Organisation" value={org} onChange={setOrg} options={[{ value: 'all', label: 'Toutes' }, ...orgs.map((o) => ({ value: o, label: o }))]} />}
        </FilterBar>
        <AuditTable logs={rows} showPoliceDetail={can(user, 'police.reason.view')} />
      </Panel>
    </>
  );
}
