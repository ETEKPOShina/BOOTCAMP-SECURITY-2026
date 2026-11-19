import { Navigate, Route, Routes } from 'react-router-dom';
import { RequirePerm } from '../../auth/guards';
import AgencyDashboard from './Dashboard';
import { TripsList, TripNew } from './Trips';
import { TripDetail, TripPassengers } from './TripDetail';
import { PassengerRegistration } from './Registration';
import { TicketsList, TicketView } from './Tickets';
import { Boarding } from './Boarding';
import { ManifestPage } from './Manifest';
import { PassengerDetail, PassengersList } from './Passengers';
import { FleetPage } from './Fleet';
import { AgencySettingsPage, TeamPage } from './TeamSettings';
import { TrackingPage } from '../shared/TrackingPage';
import { NotificationsPage } from '../shared/NotificationsPage';
import { StatisticsPage } from '../shared/StatisticsPage';
import { AuditPage } from '../shared/AuditPage';

export default function AgencyRoutes() {
  return (
    <Routes>
      <Route path="dashboard" element={<AgencyDashboard />} />
      <Route path="trips" element={<TripsList />} />
      <Route path="trips/new" element={<RequirePerm p="agency.trip.create"><TripNew /></RequirePerm>} />
      <Route path="trips/:id" element={<TripDetail />} />
      <Route path="trips/:id/passengers" element={<TripPassengers />} />
      <Route path="trips/:id/register" element={<RequirePerm p="agency.passenger.register"><PassengerRegistration /></RequirePerm>} />
      <Route path="trips/:id/boarding" element={<RequirePerm p="agency.boarding.operate"><Boarding /></RequirePerm>} />
      <Route path="trips/:id/manifest" element={<ManifestPage />} />
      <Route path="passengers" element={<PassengersList />} />
      <Route path="passengers/:id" element={<PassengerDetail />} />
      <Route path="tickets" element={<TicketsList />} />
      <Route path="tickets/:ref" element={<TicketView />} />
      <Route path="fleet" element={<FleetPage />} />
      <Route path="fleet/buses" element={<FleetPage />} />
      <Route path="fleet/drivers" element={<FleetPage />} />
      <Route path="team" element={<RequirePerm p="agency.team.view"><TeamPage /></RequirePerm>} />
      <Route path="tracking" element={<TrackingPage />} />
      <Route path="notifications" element={<NotificationsPage />} />
      <Route path="statistics" element={<RequirePerm p="agency.stats.view"><StatisticsPage /></RequirePerm>} />
      <Route path="settings" element={<RequirePerm p="agency.settings.manage"><AgencySettingsPage /></RequirePerm>} />
      <Route path="audit" element={<RequirePerm p="agency.audit.view"><AuditPage title="Historique" /></RequirePerm>} />
      <Route path="*" element={<Navigate to="/agency/dashboard" replace />} />
    </Routes>
  );
}
