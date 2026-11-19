import { Navigate, Route, Routes } from 'react-router-dom';
import { DriverEvents, DriverHome, DriverIncident, DriverProfile, DriverRoute, DriverTrip } from './Driver';

export default function DriverRoutes() {
  return (
    <Routes>
      <Route path="home" element={<DriverHome />} />
      <Route path="trip" element={<DriverTrip />} />
      <Route path="route" element={<DriverRoute />} />
      <Route path="events" element={<DriverEvents />} />
      <Route path="incident" element={<DriverIncident />} />
      <Route path="profile" element={<DriverProfile />} />
      <Route path="*" element={<Navigate to="/driver/home" replace />} />
    </Routes>
  );
}
