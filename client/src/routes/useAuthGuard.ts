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
  const hydrated = useAppSelector((s) => s.auth.hydrated);

  useEffect(() => {
    // Wait until tokens are loaded from localStorage, or a page refresh
    // would wrongly bounce a logged-in user to /login.
    if (hydrated && !token) router.replace('/login');
  }, [hydrated, token, router]);

  return { ready: hydrated && !!token };
}

/**
 * Client-side route guard requiring a minimum role.
 * Redirects to /login if logged out, or / if the role isn't high enough.
 * Replaces <RoleRoute minRole="...">.
 */
export function useRequireRole(minRole: 'CUSTOMER' | 'STAFF' | 'SUPER_ADMIN') {
  const router = useRouter();
  const token = useAppSelector((s) => s.auth.accessToken);
  const hydrated = useAppSelector((s) => s.auth.hydrated);
  const { data: user, isLoading, isFetching } = useGetMeQuery(undefined, { skip: !token });

  const userRank = ROLE_RANK[user?.role ?? ''] ?? -1;
  const minRank = ROLE_RANK[minRole] ?? 999;
  const checking = !hydrated || isLoading || (isFetching && !user);
  const authorized = hydrated && !!token && !checking && userRank >= minRank;

  useEffect(() => {
    if (!hydrated) return; // tokens not loaded from localStorage yet
    if (!token) {
      router.replace('/login');
    } else if (!checking && userRank < minRank) {
      router.replace('/');
    }
  }, [hydrated, token, checking, userRank, minRank, router]);

  return { ready: authorized, isLoading: checking || !token };
}
