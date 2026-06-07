import { Navigate, Outlet } from 'react-router-dom';
import { useAppSelector } from '../app/hooks';
import { useGetMeQuery } from '../api/apiSlice';

const ROLE_RANK: Record<string, number> = {
  CUSTOMER: 0,
  STAFF: 1,
  SUPER_ADMIN: 2,
};

interface Props {
  minRole: 'CUSTOMER' | 'STAFF' | 'SUPER_ADMIN';
}

export default function RoleRoute({ minRole }: Props) {
  const token = useAppSelector((s) => s.auth.accessToken);
  const { data: user, isLoading } = useGetMeQuery(undefined, { skip: !token });

  if (!token) return <Navigate to="/login" replace />;
  if (isLoading) return null;

  const userRank = ROLE_RANK[user?.role ?? ''] ?? -1;
  const minRank = ROLE_RANK[minRole] ?? 999;

  if (userRank < minRank) return <Navigate to="/" replace />;
  return <Outlet />;
}
