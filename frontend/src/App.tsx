import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import Login from './pages/Login';
import DeviceList from './pages/DeviceList';
import DeviceControl from './pages/DeviceControl';
import P2pControl from './pages/P2pControl';

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
      <Route
        path="/p2p/:serial"
        element={
          <ProtectedRoute>
            <P2pControl />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
