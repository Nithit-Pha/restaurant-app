import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import type { RootState } from '../app/store';
import { logout, setTokens } from '../features/auth/authSlice';

// After a content change, refresh the cached public storefront immediately.
async function revalidatePublic() {
  try {
    await fetch('/revalidate', { method: 'POST' });
  } catch {
    /* best-effort; ignore network errors */
  }
}

// Helper: revalidate the public pages once a mutation succeeds.
const revalidateOnSuccess = async (
  _arg: unknown,
  { queryFulfilled }: { queryFulfilled: Promise<unknown> },
) => {
  try {
    await queryFulfilled;
    await revalidatePublic();
  } catch {
    /* mutation failed; nothing to revalidate */
  }
};

const rawBaseQuery = fetchBaseQuery({
  baseUrl: '/api',
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.accessToken;
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  },
});

// On a 401, try to refresh the access token once. If the refresh token is
// still valid, store the new tokens and retry the request transparently.
// If refresh fails, log out (clears the stale token) so the app returns to a
// clean public state automatically — no manual logout needed.
const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error && result.error.status === 401) {
    const refreshToken = (api.getState() as RootState).auth.refreshToken;
    if (refreshToken) {
      const refreshResult = await rawBaseQuery(
        { url: '/auth/refresh', method: 'POST', body: { refreshToken } },
        api,
        extraOptions,
      );
      const data = refreshResult.data as
        | { accessToken: string; refreshToken: string }
        | undefined;
      if (data?.accessToken) {
        api.dispatch(setTokens(data));
        result = await rawBaseQuery(args, api, extraOptions); // retry original
      } else {
        api.dispatch(logout());
      }
    } else {
      api.dispatch(logout());
    }
  }

  return result;
};

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['MenuItem', 'Order', 'User', 'Settings', 'Staff', 'Finance', 'AuditLog', 'Restaurant', 'OpenStatus'],
  endpoints: (builder) => ({
    // Auth
    login: builder.mutation<AuthResponse, LoginInput>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
    }),
    register: builder.mutation<AuthResponse, RegisterInput>({
      query: (body) => ({ url: '/auth/register', method: 'POST', body }),
    }),
    getMe: builder.query<User, void>({
      query: () => '/auth/me',
      providesTags: ['User'],
    }),

    // Menu
    getMenuItems: builder.query<MenuItem[], { category?: string; available?: boolean }>({
      query: ({ category, available } = {}) => {
        const params = new URLSearchParams();
        if (category) params.set('category', category);
        if (available !== undefined) params.set('available', String(available));
        return `/menu?${params}`;
      },
      providesTags: ['MenuItem'],
    }),
    getMenuItem: builder.query<MenuItem, string>({
      query: (id) => `/menu/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'MenuItem', id }],
    }),
    getCategories: builder.query<string[], void>({
      query: () => '/menu/categories',
    }),
    createMenuItem: builder.mutation<MenuItem, FormData>({
      query: (body) => ({ url: '/menu', method: 'POST', body }),
      invalidatesTags: ['MenuItem'],
      onQueryStarted: revalidateOnSuccess,
    }),
    updateMenuItem: builder.mutation<MenuItem, { id: string; data: FormData | Partial<MenuItem> }>({
      query: ({ id, data }) => ({ url: `/menu/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['MenuItem'],
      onQueryStarted: revalidateOnSuccess,
    }),
    toggleAvailability: builder.mutation<MenuItem, { id: string; isAvailable: boolean }>({
      query: ({ id, isAvailable }) => ({
        url: `/menu/${id}/availability`,
        method: 'PATCH',
        body: { isAvailable },
      }),
      invalidatesTags: ['MenuItem'],
      onQueryStarted: revalidateOnSuccess,
    }),
    // hidden: true = the item has past orders, so it was hidden, not deleted.
    deleteMenuItem: builder.mutation<{ hidden: boolean }, string>({
      query: (id) => ({ url: `/menu/${id}`, method: 'DELETE' }),
      invalidatesTags: ['MenuItem'],
      onQueryStarted: revalidateOnSuccess,
    }),

    // Orders
    quoteOrder: builder.mutation<PricingResult, CheckoutInput>({
      query: (body) => ({ url: '/orders/quote', method: 'POST', body }),
    }),
    placeOrder: builder.mutation<Order, PlaceOrderInput>({
      query: (body) => ({ url: '/orders', method: 'POST', body }),
      invalidatesTags: ['Order'],
    }),
    getMyOrders: builder.query<Order[], void>({
      query: () => '/orders',
      providesTags: ['Order'],
    }),
    getOrder: builder.query<Order, string>({
      query: (id) => `/orders/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Order', id }],
    }),
    // date = business day 'YYYY-MM-DD' (filtered on the server); omit for all days
    getAdminOrders: builder.query<Order[], { status?: string; date?: string }>({
      query: ({ status, date } = {}) => {
        const p = new URLSearchParams();
        if (status) p.set('status', status);
        if (date) p.set('date', date);
        return `/orders/admin/all?${p}`;
      },
      providesTags: ['Order'],
    }),
    updateOrderStatus: builder.mutation<Order, StatusChangeInput>({
      query: ({ id, ...body }) => ({ url: `/orders/${id}/status`, method: 'PATCH', body }),
      invalidatesTags: ['Order'],
    }),
    cancelMyOrder: builder.mutation<Order, { id: string; note?: string }>({
      query: ({ id, note }) => ({ url: `/orders/${id}/cancel`, method: 'POST', body: { note } }),
      invalidatesTags: ['Order'],
    }),

    // Settings (Staff+ read, Super Admin write)
    getSettings: builder.query<AppSettings, void>({
      query: () => '/settings',
      providesTags: ['Settings'],
    }),
    setTaxRate: builder.mutation<void, { value: number }>({
      query: (body) => ({ url: '/settings/tax', method: 'PUT', body }),
      invalidatesTags: ['Settings'],
    }),
    setDeliveryFee: builder.mutation<void, { baseFee?: number; feePerKm?: number; freeKm?: number; maxKm?: number }>({
      query: (body) => ({ url: '/settings/delivery-fee', method: 'PUT', body }),
      invalidatesTags: ['Settings'],
    }),
    setOrdering: builder.mutation<AppSettings, { hoursEnforced: boolean }>({
      query: (body) => ({ url: '/settings/ordering', method: 'PUT', body }),
      invalidatesTags: ['Settings', 'OpenStatus'],
    }),
    // Public: is online ordering open right now?
    getOpenStatus: builder.query<OpenStatus, void>({
      query: () => '/settings/open-status',
      providesTags: ['OpenStatus'],
    }),

    // Restaurant profile (public read, Super Admin write)
    getRestaurant: builder.query<RestaurantProfile, void>({
      query: () => '/settings/restaurant',
      providesTags: ['Restaurant'],
    }),
    setRestaurant: builder.mutation<RestaurantProfile, RestaurantProfile>({
      query: (body) => ({ url: '/settings/restaurant', method: 'PUT', body }),
      invalidatesTags: ['Restaurant', 'OpenStatus'],
      onQueryStarted: revalidateOnSuccess,
    }),

    // Staff management (Super Admin only)
    getStaff: builder.query<StaffUser[], void>({
      query: () => '/admin/staff',
      providesTags: ['Staff'],
    }),
    createStaff: builder.mutation<StaffUser, { name: string; username: string; email?: string; password: string; role: 'STAFF' | 'SUPER_ADMIN' }>({
      query: (body) => ({ url: '/admin/staff', method: 'POST', body }),
      invalidatesTags: ['Staff'],
    }),
    updateStaffRole: builder.mutation<StaffUser, { id: string; role: string }>({
      query: ({ id, role }) => ({ url: `/admin/staff/${id}/role`, method: 'PATCH', body: { role } }),
      invalidatesTags: ['Staff'],
    }),
    // Accounts are deactivated, never deleted (history keeps its author).
    setStaffActive: builder.mutation<StaffUser, { id: string; isActive: boolean }>({
      query: ({ id, isActive }) => ({ url: `/admin/staff/${id}/active`, method: 'PATCH', body: { isActive } }),
      invalidatesTags: ['Staff'],
    }),

    // Audit log
    getAuditLog: builder.query<AuditLogResponse, AuditLogParams>({
      query: ({ actorId, entityType, startDate, endDate, limit, offset } = {}) => {
        const p = new URLSearchParams();
        if (actorId) p.set('actorId', actorId);
        if (entityType) p.set('entityType', entityType);
        if (startDate) p.set('startDate', startDate);
        if (endDate) p.set('endDate', endDate);
        if (limit) p.set('limit', String(limit));
        if (offset) p.set('offset', String(offset));
        return `/admin/audit-log?${p}`;
      },
      providesTags: ['AuditLog' as any],
    }),
  }),
});

export const {
  useLoginMutation,
  useRegisterMutation,
  useGetMeQuery,
  useGetSettingsQuery,
  useSetTaxRateMutation,
  useSetDeliveryFeeMutation,
  useSetOrderingMutation,
  useGetOpenStatusQuery,
  useGetRestaurantQuery,
  useSetRestaurantMutation,
  useGetStaffQuery,
  useCreateStaffMutation,
  useUpdateStaffRoleMutation,
  useSetStaffActiveMutation,
  useGetAuditLogQuery,
  useGetMenuItemsQuery,
  useGetMenuItemQuery,
  useGetCategoriesQuery,
  useCreateMenuItemMutation,
  useUpdateMenuItemMutation,
  useToggleAvailabilityMutation,
  useDeleteMenuItemMutation,
  useQuoteOrderMutation,
  usePlaceOrderMutation,
  useGetMyOrdersQuery,
  useGetOrderQuery,
  useGetAdminOrdersQuery,
  useUpdateOrderStatusMutation,
  useCancelMyOrderMutation,
} = apiSlice;

// --- Types ---
export interface User {
  id: string;
  name: string;
  username: string;
  email: string | null;
  role: 'CUSTOMER' | 'STAFF' | 'SUPER_ADMIN';
  phone?: string;
  address?: string;
  createdAt: string;
}

export interface AppSettings {
  TAX_RATE: number;
  DELIVERY_BASE_FEE: number;
  DELIVERY_FEE_PER_KM: number;
  DELIVERY_FREE_KM: number;
  DELIVERY_MAX_KM: number;
  ORDERING_HOURS_ENFORCED: number; // 1 = only accept orders during opening hours
}

export interface OpenStatus {
  isOpen: boolean;
  enforced: boolean;
  nextOpening: { dayOfWeek: string; time: string; inDays: number } | null;
  timeZone: string;
}

export interface RestaurantProfile {
  name: string;
  legalName: string;
  description: string;
  telephone: string;
  priceRange: string;
  servesCuisine: string[];
  address: {
    streetAddress: string;
    addressLocality: string;
    addressRegion: string;
    postalCode: string;
    addressCountry: string;
  };
  geo: { latitude: number; longitude: number };
  openingHours: { dayOfWeek: string[]; opens: string; closes: string }[];
  sameAs: string[];
}

export interface StaffUser {
  id: string;
  name: string;
  username: string;
  email: string | null;
  role: 'STAFF' | 'SUPER_ADMIN';
  isActive: boolean;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actor: { id: string; name: string; username: string; email: string | null; role: string };
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogResponse {
  total: number;
  logs: AuditLogEntry[];
}

export interface AuditLogParams {
  actorId?: string;
  entityType?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  category: string;
  costPrice: number;
  sellingPrice: number;
  imageUrl?: string;
  isAvailable: boolean;
  createdAt: string;
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  nameSnapshot: string;
  unitPrice: number;
  unitCost: number;
  quantity: number;
}

export type OrderStatus = 'PENDING' | 'PREPARING' | 'READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';
export type CancelReason = 'SOLD_OUT' | 'CLOSING_SOON' | 'TOO_BUSY' | 'OUT_OF_AREA' | 'CUSTOMER_REQUEST' | 'OTHER';

export interface OrderStatusHistoryEntry {
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  note?: string | null;
  createdAt: string;
  actor?: { name: string; role: string } | null;
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  type: 'PICKUP' | 'DELIVERY';
  status: OrderStatus;
  orderNumber?: number | null;
  businessDate?: string | null;
  customerPhone?: string | null;
  acceptedAt?: string | null;
  estimatedReadyAt?: string | null;
  readyAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: CancelReason | null;
  cancelNote?: string | null;
  statusHistory?: OrderStatusHistoryEntry[];
  user?: { id: string; name: string; username: string; email: string | null; phone?: string | null };
  deliveryAddress?: string;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  deliveryFee: number;
  total: number;
  profit?: number;
  createdAt: string;
}

export interface PricingResult {
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  deliveryFee: number;
  total: number;
  profit: number;
  totalCost: number;
}

export interface CheckoutInput {
  items: { menuItemId: string; quantity: number }[];
  type: 'PICKUP' | 'DELIVERY';
  deliveryAddress?: string;
  deliveryLat?: number;
  deliveryLng?: number;
}

export interface PlaceOrderInput extends CheckoutInput {
  customerPhone: string;
  idempotencyKey: string; // one UUID per checkout attempt
}

export interface StatusChangeInput {
  id: string;
  status: Exclude<OrderStatus, 'PENDING'>;
  prepMinutes?: number;
  cancelReason?: CancelReason;
  cancelNote?: string;
}

interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

interface LoginInput {
  username: string;
  password: string;
}

interface RegisterInput {
  name: string;
  username: string;
  email: string;
  password: string;
}
