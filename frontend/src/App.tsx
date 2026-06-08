import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import Login from './pages/Login';
import DeviceList from './pages/DeviceList';
import DeviceControl from './pages/DeviceControl';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DeviceList />
          </ProtectedRoute>
        }
      />
      <Route
        path="/device/:serial"
        element={
          <ProtectedRoute>
            <DeviceControl />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
