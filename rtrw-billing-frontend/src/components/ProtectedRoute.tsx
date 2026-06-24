import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/store/auth';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const token = useAuth((s) => s.accessToken);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
