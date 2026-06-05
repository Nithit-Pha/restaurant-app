import { Navigate, Outlet } from 'react-router-dom';
import { useAppSelector } from '../app/hooks';

export default function ProtectedRoute() {
  const token = useAppSelector((s) => s.auth.accessToken);
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}
