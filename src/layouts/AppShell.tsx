import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { Bell, LogOut, Menu, X, ChevronDown, User as UserIcon } from 'lucide-react';
import { useAuth, useUser } from '../auth/AuthContext';
import { useDb } from '../data/store';
import { can, workspaceLabel, workspaceOf } from '../domain/permissions';
import { roleLabel } from '../domain/labels';
import { fmtLongDate } from '../lib/dates';
import { useNetwork } from '../lib/network';
import { notificationsFor, orgById } from '../services/queries';
import { markAllRead, markNotificationRead } from '../services/api';
import { NotificationList } from '../components/domain';
import { NetworkBadge } from '../components/status';
import { NAV } from './nav';

export function DemoBar() {
  return (
    <div className="demo-bar" role="note">
      <strong>Environnement de démonstration — données fictives.</strong>
      <span className="demo-bar-detail">Transmissions, vérifications police, captures et positions sont simulées.</span>
    </div>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
}

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, close]);
  return ref;
}

function NotificationsButton() {
  const user = useUser();
  const db = useDb();
  const [open, setOpen] = useState(false);
  const ref = useOutside(open, () => setOpen(false));
  const items = notificationsFor(db, user);
  const unread = items.filter((n) => !n.readBy.includes(user.id));
  const ws = workspaceOf(user.role);
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="icon-btn" aria-label={`Notifications${unread.length ? ` (${unread.length} non lues)` : ''}`} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Bell size={20} aria-hidden />
        {unread.length > 0 && <span className="dot" aria-hidden>{unread.length > 9 ? '9+' : unread.length}</span>}
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Notifications">
          <div className="panel-head">
            <h2 style={{ fontSize: 15 }}>Notifications</h2>
            <div className="row">
              {unread.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => markAllRead(user, unread.map((n) => n.id))}>Tout marquer comme lu</button>}
            </div>
          </div>
          <NotificationList items={items} userId={user.id} limit={8} onOpen={(n) => { markNotificationRead(user, n.id); setOpen(false); }} />
          <div style={{ padding: 10, borderTop: '1px solid var(--border)' }}>
            <Link to={`/${ws}/notifications`} className="btn btn-secondary btn-sm btn-block" onClick={() => setOpen(false)}>Voir toutes les notifications</Link>
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const user = useUser();
  const { signOut } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useOutside(open, () => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="user-btn" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((v) => !v)}>
        <span className="avatar" aria-hidden>{initials(user.name)}</span>
        <span className="user-meta"><strong>{user.name}</strong><span>{roleLabel[user.role]}</span></span>
        <ChevronDown size={16} aria-hidden />
        <span className="sr-only">Menu utilisateur</span>
      </button>
      {open && (
        <div className="menu" role="menu">
          <div style={{ padding: '8px 12px 10px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
            <div className="strong">{user.name}</div>
            <div className="small muted">{roleLabel[user.role]}</div>
            <div className="small muted mono">{user.login}</div>
          </div>
          <button type="button" role="menuitem" onClick={() => { signOut(); nav('/login'); }}><LogOut size={16} aria-hidden />Déconnexion</button>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  const user = useUser();
  const db = useDb();
  const { signOut } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [drawer, setDrawer] = useState(false);
  const net = useNetwork();
  const ws = workspaceOf(user.role);
  const org = orgById(db, user.organizationId);
  const items = ws === 'driver' ? [] : NAV[ws].filter((n) => !n.perm || can(user, n.perm));

  useEffect(() => { setDrawer(false); }, [loc.pathname, loc.search]);

  let lastGroup: string | undefined;
  return (
    <>
      <a href="#contenu" className="skip-link">Aller au contenu principal</a>
      <DemoBar />
      <div className="app">
        <div className={`drawer-overlay ${drawer ? 'open' : ''}`} onClick={() => setDrawer(false)} aria-hidden />
        <aside className={`sidebar ${drawer ? 'open' : ''}`} aria-label="Navigation principale">
          <div className="sidebar-brand">
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <Link to={`/${ws}/dashboard`} aria-label="WeZonPass — tableau de bord"><img src={`${import.meta.env.BASE_URL}brand/wezonpass-logo-couleur.png`} alt="WeZonPass" width={113} height={40} /></Link>
              {drawer && <button type="button" className="icon-btn" aria-label="Fermer le menu" onClick={() => setDrawer(false)}><X size={20} /></button>}
            </div>
            <div className="sidebar-ws"><strong>{workspaceLabel[ws]}</strong>{org?.name}</div>
          </div>
          <nav className="nav">
            {items.map((n) => {
              const showGroup = n.group && n.group !== lastGroup;
              if (n.group) lastGroup = n.group;
              const [path, query] = n.to.split('?');
              const active = query
                ? loc.pathname === path && loc.search === `?${query}`
                : (loc.pathname === path || loc.pathname.startsWith(`${path}/`)) && !items.some((o) => o.to === `${path}${loc.search}` && o.to !== n.to);
              return (
                <div key={n.to} style={{ display: 'contents' }}>
                  {showGroup && <div className="nav-group" aria-hidden>{n.group}</div>}
                  <Link to={n.to} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
                    {n.icon}<span>{n.label}</span>
                  </Link>
                </div>
              );
            })}
          </nav>
          <div className="sidebar-foot">
            <button type="button" className="btn btn-ghost btn-block" style={{ justifyContent: 'flex-start' }} onClick={() => { signOut(); nav('/login'); }}><LogOut size={18} aria-hidden />Déconnexion</button>
          </div>
        </aside>
        <div className="main">
          <header className="header">
            <button type="button" className="icon-btn header-menu-btn" aria-label="Ouvrir le menu" aria-expanded={drawer} onClick={() => setDrawer(true)}><Menu size={22} /></button>
            <img className="header-logo-mobile" src={`${import.meta.env.BASE_URL}brand/wezonpass-symbole-couleur.png`} alt="WeZonPass" width={42} height={30} />
            <div className="header-title">
              <strong>{workspaceLabel[ws]}</strong>
              <span>{org?.name}</span>
            </div>
            <div className="header-spacer" />
            <span className="header-date">{fmtLongDate()}</span>
            {net.offline && <NetworkBadge offline pending={0} />}
            <NotificationsButton />
            <UserMenu />
          </header>
          <main id="contenu" className="content" tabIndex={-1}>
            {children ?? <Outlet />}
          </main>
        </div>
      </div>
    </>
  );
}

export function UserIconSmall() {
  return <UserIcon size={16} aria-hidden />;
}
