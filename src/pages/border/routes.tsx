import { Navigate, Route, Routes } from 'react-router-dom';
import { BorderDashboard, BorderDiscrepancies, BorderExpected, BorderHistory, BorderPassengerCheck, BorderTrip } from './Border';
import { NotificationsPage } from '../shared/NotificationsPage';

export default function BorderRoutes() {
  return (
    <Routes>
      <Route path="dashboard" element={<BorderDashboard />} />
      <Route path="expected-buses" element={<BorderExpected key="exp" />} />
      <Route path="arrivals" element={<BorderExpected key="arr" arrivals />} />
      <Route path="trips/:id" element={<BorderTrip />} />
      <Route path="passenger-check" element={<BorderPassengerCheck />} />
      <Route path="discrepancies" element={<BorderDiscrepancies />} />
      <Route path="history" element={<BorderHistory />} />
      <Route path="notifications" element={<NotificationsPage />} />
      <Route path="*" element={<Navigate to="/border/dashboard" replace />} />
    </Routes>
  );
}
