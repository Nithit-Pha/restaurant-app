// Settings → Permissions (Step 3e): what Staff may do. The owner may always do everything.
import { apiSlice, useGetMeQuery } from '../../api/apiSlice';
import { useAppSelector } from '../../app/hooks';

export const PERMISSION_KEYS = ['orders.purchase', 'suppliers.edit', 'deliveries.receive', 'stock.moves', 'prices.enter'] as const;
export type Permission = (typeof PERMISSION_KEYS)[number];
export type PermissionSet = Record<Permission, boolean>;

interface PermissionsResponse {
  staff: PermissionSet; // the settings for Staff
  mine: PermissionSet; // what the signed-in user may do
}

const api = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getPermissions: builder.query<PermissionsResponse, void>({
      query: () => '/permissions',
      providesTags: ['Settings'],
    }),
    updatePermissions: builder.mutation<PermissionsResponse, Partial<PermissionSet>>({
      query: (body) => ({ url: '/permissions', method: 'PUT', body }),
      invalidatesTags: ['Settings'],
    }),
  }),
});

export const { useGetPermissionsQuery, useUpdatePermissionsMutation } = api;

/**
 * What the signed-in staff member or owner may do. The owner may always;
 * staff only once the settings are loaded (nothing extra is shown before).
 */
export function usePermissions() {
  const token = useAppSelector((st) => st.auth.accessToken);
  const { data: me } = useGetMeQuery(undefined, { skip: !token });
  const staffLike = me?.role === 'STAFF' || me?.role === 'SUPER_ADMIN';
  const { data, isLoading } = useGetPermissionsQuery(undefined, { skip: !staffLike });
  const isOwner = me?.role === 'SUPER_ADMIN';
  const can = (p: Permission) => isOwner || (me?.role === 'STAFF' && !!data?.mine[p]);
  return { can, isOwner, loading: !me || (staffLike && isLoading) };
}
