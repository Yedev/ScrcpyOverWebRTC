import { Navigate } from 'react-router-dom';
import { ReactNode } from 'react';
import { useAuth } from '../store/auth';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const token = useAuth((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
