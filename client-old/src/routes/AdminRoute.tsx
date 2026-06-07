import { Navigate, Outlet } from 'react-router-dom';
import { useAppSelector } from '../app/hooks';
import { useGetMeQuery } from '../api/apiSlice';

export default function AdminRoute() {
  const token = useAppSelector((s) => s.auth.accessToken);
  const { data: user, isLoading } = useGetMeQuery(undefined, { skip: !token });

  if (!token) return <Navigate to="/login" replace />;
  if (isLoading) return null;
  if (user?.role !== 'ADMIN') return <Navigate to="/" replace />;
  return <Outlet />;
}
