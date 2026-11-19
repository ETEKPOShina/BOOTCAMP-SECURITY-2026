import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useDb } from '../../data/store';
import { workspaceHome, workspaceOf } from '../../domain/permissions';
import { NotFoundPage } from './PublicPages';

/** Destination du QR code d'un billet : redirige vers la vue autorisée selon le rôle connecté. */
export function TicketResolver() {
  const { ref = '' } = useParams();
  const { user } = useAuth();
  const db = useDb();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  const pt = db.passengerTrips.find((x) => x.ticketReference === ref.toUpperCase());
  if (!pt) return <NotFoundPage />;
  const trip = db.trips.find((t) => t.id === pt.tripId);
  const ws = workspaceOf(user.role);
  switch (ws) {
    case 'agency':
      return <Navigate to={trip?.agencyId === user.organizationId ? `/agency/tickets/${pt.ticketReference}` : '/agency/tickets'} replace />;
    case 'border':
      return <Navigate to={`/border/passenger-check?ref=${encodeURIComponent(pt.ticketReference)}`} replace />;
    case 'police':
      return <Navigate to={`/police/passengers/${pt.id}`} replace />;
    case 'customs':
      return <Navigate to={trip ? `/customs/trips/${trip.id}` : '/customs/dashboard'} replace />;
    default:
      return <Navigate to={workspaceHome[ws]} replace />;
  }
}
