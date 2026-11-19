import { useMemo, useState } from 'react';
import { useUser } from '../../auth/AuthContext';
import { useDb } from '../../data/store';
import { notificationsFor } from '../../services/queries';
import { markAllRead, markNotificationRead } from '../../services/api';
import { NotificationList } from '../../components/domain';
import { Button, FilterBar, FilterSelect, PageTitle, Panel } from '../../components/ui';

export function NotificationsPage() {
  const user = useUser();
  const db = useDb();
  const [filter, setFilter] = useState('all');
  const all = notificationsFor(db, user);
  const items = useMemo(() => all.filter((n) => (filter === 'unread' ? !n.readBy.includes(user.id) : filter === 'all' ? true : n.severity === filter)), [all, filter, user.id]);
  const unread = all.filter((n) => !n.readBy.includes(user.id));
  return (
    <>
      <PageTitle title="Notifications" lead="Informations opérationnelles destinées à votre organisation et à votre rôle." actions={unread.length > 0 && <Button onClick={() => markAllRead(user, unread.map((n) => n.id))}>Tout marquer comme lu ({unread.length})</Button>} />
      <Panel flush>
        <FilterBar>
          <FilterSelect label="Afficher" value={filter} onChange={setFilter} options={[
            { value: 'all', label: 'Toutes' }, { value: 'unread', label: 'Non lues' }, { value: 'critical', label: 'Critiques' },
            { value: 'attention', label: 'Attention' }, { value: 'success', label: 'Confirmations' }, { value: 'info', label: 'Informations' },
          ]} />
          <span className="small muted" aria-live="polite">{items.length} notification(s)</span>
        </FilterBar>
        <NotificationList items={items} userId={user.id} onOpen={(n) => markNotificationRead(user, n.id)} />
      </Panel>
    </>
  );
}
