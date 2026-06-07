'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppSelector } from '../app/hooks';
import { useGetMeQuery } from '../api/apiSlice';

const ROLE_RANK: Record<string, number> = {
  CUSTOMER: 0,
  STAFF: 1,
  SUPER_ADMIN: 2,
};

/**
 * Client-side route guard for any logged-in user.
 * Redirects to /login if there's no token. Replaces <ProtectedRoute>.
 * Returns `ready` — render nothing (or a loader) until it's true.
 */
export function useRequireAuth() {
  const router = useRouter();
  const token = useAppSelector((s) => s.auth.accessToken);

  useEffect(() => {
    if (!token) router.replace('/login');
  }, [token, router]);

  return { ready: !!token };
}

/**
 * Client-side route guard requiring a minimum role.
 * Redirects to /login if logged out, or / if the role isn't high enough.
 * Replaces <RoleRoute minRole="...">.
 */
export function useRequireRole(minRole: 'CUSTOMER' | 'STAFF' | 'SUPER_ADMIN') {
  const router = useRouter();
  const token = useAppSelector((s) => s.auth.accessToken);
  const { data: user, isLoading } = useGetMeQuery(undefined, { skip: !token });

  const userRank = ROLE_RANK[user?.role ?? ''] ?? -1;
  const minRank = ROLE_RANK[minRole] ?? 999;
  const authorized = !!token && !isLoading && userRank >= minRank;

  useEffect(() => {
    if (!token) {
      router.replace('/login');
    } else if (!isLoading && userRank < minRank) {
      router.replace('/');
    }
  }, [token, isLoading, userRank, minRank, router]);

  return { ready: authorized, isLoading: isLoading || !token };
}
