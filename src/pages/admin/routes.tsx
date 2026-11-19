import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminAccountDetail, AdminAccounts, AdminAgencies, AdminAgencyDetail, AdminDashboard, AdminPartners, AdminRoles, AdminSettings, AdminTripDetail, AdminTrips } from './Admin';
import { FleetPage } from '../agency/Fleet';
import { TrackingPage } from '../shared/TrackingPage';
import { StatisticsPage } from '../shared/StatisticsPage';
import { NotificationsPage } from '../shared/NotificationsPage';
import { AuditPage } from '../shared/AuditPage';

export default function AdminRoutes() {
  return (
    <Routes>
      <Route path="dashboard" element={<AdminDashboard />} />
      <Route path="agencies" element={<AdminAgencies />} />
      <Route path="agencies/:id" element={<AdminAgencyDetail />} />
      <Route path="partners" element={<AdminPartners />} />
      <Route path="accounts" element={<AdminAccounts />} />
      <Route path="accounts/:id" element={<AdminAccountDetail />} />
      <Route path="roles" element={<AdminRoles />} />
      <Route path="trips" element={<AdminTrips />} />
      <Route path="trips/:id" element={<AdminTripDetail />} />
      <Route path="fleet" element={<FleetPage global />} />
      <Route path="fleet/buses" element={<FleetPage global />} />
      <Route path="fleet/drivers" element={<FleetPage global />} />
      <Route path="live-tracking" element={<TrackingPage />} />
      <Route path="statistics" element={<StatisticsPage />} />
      <Route path="notifications" element={<NotificationsPage />} />
      <Route path="audit" element={<AuditPage />} />
      <Route path="settings" element={<AdminSettings />} />
      <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
    </Routes>
  );
}
