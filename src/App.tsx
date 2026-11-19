import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { RequireWorkspace } from './auth/guards';
import { ToastProvider } from './components/Toast';
import { LoadingState } from './components/ui';
import { AppShell } from './layouts/AppShell';
import { workspaceHome, workspaceOf } from './domain/permissions';
import type { Workspace } from './domain/types';
import { LoginPage } from './pages/public/Login';
import { AccessRequestPage, AccessPendingPage, ForgotPasswordPage, NotFoundPage } from './pages/public/PublicPages';
import { TicketResolver } from './pages/public/TicketResolver';

const AgencyRoutes = lazy(() => import('./pages/agency/routes'));
const PoliceRoutes = lazy(() => import('./pages/police/routes'));
const BorderRoutes = lazy(() => import('./pages/border/routes'));
const CustomsRoutes = lazy(() => import('./pages/customs/routes'));
const AdminRoutes = lazy(() => import('./pages/admin/routes'));
const DriverRoutes = lazy(() => import('./pages/driver/routes'));

function Workspace({ ws, children }: { ws: Workspace; children: ReactNode }) {
  return (
    <RequireWorkspace ws={ws}>
      <AppShell>
        <Suspense fallback={<LoadingState />}>{children}</Suspense>
      </AppShell>
    </RequireWorkspace>
  );
}

function Home() {
  const { user } = useAuth();
  return <Navigate to={user ? workspaceHome[workspaceOf(user.role)] : '/login'} replace />;
}

// Version hébergée (page claude.ai) : navigation en mémoire, l'adresse de la page ne change pas.
const Router = import.meta.env.VITE_ROUTER === 'memory'
  ? ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={['/']}>{children}</MemoryRouter>
  : BrowserRouter;

export function App() {
  return (
    <Router>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/access-request" element={<AccessRequestPage />} />
            <Route path="/access-pending" element={<AccessPendingPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/billet/:ref" element={<TicketResolver />} />
            <Route path="/agency/*" element={<Workspace ws="agency"><AgencyRoutes /></Workspace>} />
            <Route path="/police/*" element={<Workspace ws="police"><PoliceRoutes /></Workspace>} />
            <Route path="/border/*" element={<Workspace ws="border"><BorderRoutes /></Workspace>} />
            <Route path="/customs/*" element={<Workspace ws="customs"><CustomsRoutes /></Workspace>} />
            <Route path="/admin/*" element={<Workspace ws="admin"><AdminRoutes /></Workspace>} />
            <Route path="/driver/*" element={<RequireWorkspace ws="driver"><Suspense fallback={<LoadingState />}><DriverRoutes /></Suspense></RequireWorkspace>} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </Router>
  );
}
