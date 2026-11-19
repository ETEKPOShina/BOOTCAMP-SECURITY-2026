import { Navigate, Route, Routes } from 'react-router-dom';
import { CustomsArrivals, CustomsBaggage, CustomsDashboard, CustomsHistory, CustomsTrip } from './Customs';
import { NotificationsPage } from '../shared/NotificationsPage';

export default function CustomsRoutes() {
  return (
    <Routes>
      <Route path="dashboard" element={<CustomsDashboard />} />
      <Route path="arrivals" element={<CustomsArrivals />} />
      <Route path="trips/:id" element={<CustomsTrip />} />
      <Route path="baggage" element={<CustomsBaggage key="bag" />} />
      <Route path="declarations" element={<CustomsBaggage key="decl" declarationsOnly />} />
      <Route path="history" element={<CustomsHistory />} />
      <Route path="notifications" element={<NotificationsPage />} />
      <Route path="*" element={<Navigate to="/customs/dashboard" replace />} />
    </Routes>
  );
}
