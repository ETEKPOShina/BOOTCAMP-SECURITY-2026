import { Navigate, Route, Routes } from 'react-router-dom';
import { PoliceArrivals, PoliceDashboard, PoliceManifestDetail, PoliceManifests, PolicePassengerDetail, PolicePassengers } from './Police';
import { NotificationsPage } from '../shared/NotificationsPage';
import { AuditPage } from '../shared/AuditPage';

export default function PoliceRoutes() {
  return (
    <Routes>
      <Route path="dashboard" element={<PoliceDashboard />} />
      <Route path="manifests" element={<PoliceManifests />} />
      <Route path="manifests/:id" element={<PoliceManifestDetail />} />
      <Route path="passengers" element={<PolicePassengers key="all" />} />
      <Route path="passengers/:id" element={<PolicePassengerDetail />} />
      <Route path="review-queue" element={<PolicePassengers key="queue" queue />} />
      <Route path="arrivals" element={<PoliceArrivals />} />
      <Route path="notifications" element={<NotificationsPage />} />
      <Route path="audit" element={<AuditPage title="Historique" />} />
      <Route path="*" element={<Navigate to="/police/dashboard" replace />} />
    </Routes>
  );
}
