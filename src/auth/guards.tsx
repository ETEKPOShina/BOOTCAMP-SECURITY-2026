import { useEffect, useRef, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ShieldX } from 'lucide-react';
import { useAuth } from './AuthContext';
import { can, workspaceHome, workspaceOf, type Permission } from '../domain/permissions';
import type { Workspace } from '../domain/types';
import { logAccessDenied, FORBIDDEN_MESSAGE } from '../services/api';
import { useToast } from '../components/Toast';
import { EmptyState } from '../components/ui';

function Denied({ to }: { to: string }) {
  const { user } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const toast = useToast();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !user) return;
    done.current = true;
    logAccessDenied(user, loc.pathname);
    toast(FORBIDDEN_MESSAGE, 'error');
    nav(to, { replace: true });
  }, [user, loc.pathname, nav, to, toast]);
  return null;
}

/** Protège un espace de travail : un utilisateur ne peut pas accéder à un autre espace en modifiant l'URL. */
export function RequireWorkspace({ ws, children }: { ws: Workspace; children: ReactNode }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  const own = workspaceOf(user.role);
  if (own !== ws) return <Denied to={workspaceHome[own]} />;
  return <>{children}</>;
}

export function RequirePerm({ p, children }: { p: Permission; children: ReactNode }) {
  const { user } = useAuth();
  if (!can(user, p)) {
    return (
      <div className="panel">
        <EmptyState title="Accès non autorisé" icon={<ShieldX size={32} aria-hidden />}>
          {FORBIDDEN_MESSAGE} Votre rôle ne permet pas d'ouvrir cette page.
        </EmptyState>
      </div>
    );
  }
  return <>{children}</>;
}
