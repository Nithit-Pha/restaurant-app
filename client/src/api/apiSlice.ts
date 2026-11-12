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
  tagTypes: ['MenuItem', 'Order', 'User', 'Settings', 'Staff', 'Finance', 'AuditLog', 'Restaurant', 'OpenStatus', 'Address', 'Floor', 'Visit', 'Stock', 'Supplier'],
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
    // Remember the website language on the account (the site switches to it after sign-in).
    setMyLocale: builder.mutation<void, 'en' | 'th'>({
      query: (locale) => ({ url: '/auth/me/locale', method: 'PUT', body: { locale } }),
      invalidatesTags: ['User'],
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
    // Replaces the item's option groups (sent in display order).
    setItemOptions: builder.mutation<MenuItem, { id: string; groups: ModifierGroupInput[] }>({
      query: ({ id, groups }) => ({ url: `/menu/${id}/options`, method: 'PUT', body: { groups } }),
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
      // Dine-in orders also change their table on the floor view.
      invalidatesTags: ['Order', 'Floor', 'Visit'],
    }),
    cancelMyOrder: builder.mutation<Order, { id: string; note?: string }>({
      query: ({ id, note }) => ({ url: `/orders/${id}/cancel`, method: 'POST', body: { note } }),
      invalidatesTags: ['Order'],
    }),

    // Payments
    getPromptPayQr: builder.query<PromptPayQr, string>({
      query: (id) => `/orders/${id}/promptpay`,
    }),
    // Customer: "I've transferred" (PromptPay)
    reportPaymentSent: builder.mutation<Order, string>({
      query: (id) => ({ url: `/orders/${id}/payment/sent`, method: 'POST' }),
      invalidatesTags: ['Order'],
    }),
    // Staff: money received
    markOrderPaid: builder.mutation<Order, { id: string; providerRef?: string; note?: string }>({
      query: ({ id, ...body }) => ({ url: `/orders/${id}/payment/paid`, method: 'POST', body }),
      invalidatesTags: ['Order', 'Finance'],
    }),
    // Owner: money given back
    refundOrder: builder.mutation<Order, { id: string; note?: string }>({
      query: ({ id, ...body }) => ({ url: `/orders/${id}/payment/refund`, method: 'POST', body }),
      invalidatesTags: ['Order', 'Finance'],
    }),
    // Busy mode (staff): Normal / Busy (+minutes) / Paused
    setBusyMode: builder.mutation<BusyMode, BusyModeInput>({
      query: (body) => ({ url: '/settings/busy', method: 'PUT', body }),
      invalidatesTags: ['OpenStatus'],
    }),
    getPaymentOptions: builder.query<PaymentOptions, void>({
      query: () => '/settings/payment-options',
      providesTags: ['Settings'],
    }),
    getPaymentSettings: builder.query<PaymentSettings, void>({
      query: () => '/settings/payment',
      providesTags: ['Settings'],
    }),
    setPaymentSettings: builder.mutation<PaymentSettings, PaymentSettings>({
      query: (body) => ({ url: '/settings/payment', method: 'PUT', body }),
      invalidatesTags: ['Settings'],
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
    setOrdering: builder.mutation<AppSettings, { hoursEnforced?: boolean; defaultPrepMinutes?: number }>({
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

    // The signed-in customer's saved delivery addresses
    getAddresses: builder.query<SavedAddress[], void>({
      query: () => '/addresses',
      providesTags: ['Address'],
    }),
    createAddress: builder.mutation<SavedAddress, AddressInput>({
      query: (body) => ({ url: '/addresses', method: 'POST', body }),
      invalidatesTags: ['Address'],
    }),
    deleteAddress: builder.mutation<void, string>({
      query: (id) => ({ url: `/addresses/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Address'],
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

    // Floor plan (dine-in). Staff read it; only the Super Admin changes it.
    getFloor: builder.query<FloorZone[], void>({
      query: () => '/tables/floor',
      providesTags: ['Floor'],
    }),
    createZone: builder.mutation<FloorZone, ZoneInput>({
      query: (body) => ({ url: '/tables/zones', method: 'POST', body }),
      invalidatesTags: ['Floor'],
    }),
    updateZone: builder.mutation<FloorZone, { id: string } & Partial<ZoneInput>>({
      query: ({ id, ...body }) => ({ url: `/tables/zones/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Floor'],
    }),
    deleteZone: builder.mutation<void, string>({
      query: (id) => ({ url: `/tables/zones/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Floor'],
    }),
    saveZoneLayout: builder.mutation<FloorZone, { id: string } & LayoutInput>({
      query: ({ id, ...body }) => ({ url: `/tables/zones/${id}/layout`, method: 'PUT', body }),
      invalidatesTags: ['Floor'],
    }),
    getQrCodes: builder.query<QrZone[], void>({
      query: () => '/tables/qr-codes',
      providesTags: ['Floor'],
    }),
    // The old sticker stops working.
    regenerateQr: builder.mutation<QrTable, string>({
      query: (tableId) => ({ url: `/tables/${tableId}/qr`, method: 'POST' }),
      invalidatesTags: ['Floor'],
    }),
    // Staff confirm that dine-in guests are really at the table.
    confirmVisit: builder.mutation<void, { id: string; guests?: number }>({
      query: ({ id, ...body }) => ({ url: `/dine-in/visits/${id}/confirm`, method: 'POST', body }),
      invalidatesTags: ['Order', 'Floor', 'Visit'],
    }),

    // Floor view (staff): live table states and table actions.
    getFloorView: builder.query<FloorView, void>({
      query: () => '/dine-in/floor',
      providesTags: ['Floor'],
    }),
    getStaffVisit: builder.query<TableVisit, string>({
      query: (id) => `/dine-in/visits/${id}`,
      providesTags: ['Visit'],
    }),
    seatGuests: builder.mutation<TableVisit, { tableId: string; guests?: number }>({
      query: ({ tableId, ...body }) => ({ url: `/dine-in/tables/${tableId}/seat`, method: 'POST', body }),
      invalidatesTags: ['Floor', 'Visit'],
    }),
    moveVisit: builder.mutation<TableVisit, { id: string; tableId: string }>({
      query: ({ id, ...body }) => ({ url: `/dine-in/visits/${id}/move`, method: 'POST', body }),
      invalidatesTags: ['Floor', 'Visit', 'Order'],
    }),
    mergeVisits: builder.mutation<TableVisit, { id: string; intoVisitId: string }>({
      query: ({ id, ...body }) => ({ url: `/dine-in/visits/${id}/merge`, method: 'POST', body }),
      invalidatesTags: ['Floor', 'Visit', 'Order'],
    }),
    // The table's bill, paid at the counter.
    getVisitPromptPay: builder.query<PromptPayQr, string>({
      query: (id) => `/dine-in/visits/${id}/promptpay`,
      keepUnusedDataFor: 0, // the amount changes with every round
    }),
    payVisit: builder.mutation<{ total: number; method: PaymentMethod; visit: TableVisit }, { id: string; method: PaymentMethod; providerRef?: string; markServed?: boolean }>({
      query: ({ id, ...body }) => ({ url: `/dine-in/visits/${id}/pay`, method: 'POST', body }),
      invalidatesTags: ['Floor', 'Visit', 'Order', 'Finance'],
    }),
    markTableCleaned: builder.mutation<void, string>({
      query: (tableId) => ({ url: `/dine-in/tables/${tableId}/cleaned`, method: 'POST' }),
      invalidatesTags: ['Floor'],
    }),
  }),
});

export const {
  useLoginMutation,
  useRegisterMutation,
  useGetMeQuery,
  useSetMyLocaleMutation,
  useSetBusyModeMutation,
  useGetSettingsQuery,
  useSetTaxRateMutation,
  useSetDeliveryFeeMutation,
  useSetOrderingMutation,
  useGetOpenStatusQuery,
  useGetRestaurantQuery,
  useSetRestaurantMutation,
  useGetAddressesQuery,
  useCreateAddressMutation,
  useDeleteAddressMutation,
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
  useSetItemOptionsMutation,
  useQuoteOrderMutation,
  usePlaceOrderMutation,
  useGetMyOrdersQuery,
  useGetOrderQuery,
  useGetAdminOrdersQuery,
  useUpdateOrderStatusMutation,
  useCancelMyOrderMutation,
  useGetPromptPayQrQuery,
  useReportPaymentSentMutation,
  useMarkOrderPaidMutation,
  useRefundOrderMutation,
  useGetPaymentOptionsQuery,
  useGetPaymentSettingsQuery,
  useSetPaymentSettingsMutation,
  useGetFloorQuery,
  useCreateZoneMutation,
  useUpdateZoneMutation,
  useDeleteZoneMutation,
  useSaveZoneLayoutMutation,
  useGetQrCodesQuery,
  useRegenerateQrMutation,
  useConfirmVisitMutation,
  useGetFloorViewQuery,
  useGetStaffVisitQuery,
  useSeatGuestsMutation,
  useMoveVisitMutation,
  useMergeVisitsMutation,
  useMarkTableCleanedMutation,
  useLazyGetVisitPromptPayQuery,
  usePayVisitMutation,
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
  locale?: 'en' | 'th'; // website language the user last chose
  createdAt: string;
}

export interface AppSettings {
  TAX_RATE: number;
  DELIVERY_BASE_FEE: number;
  DELIVERY_FEE_PER_KM: number;
  DELIVERY_FREE_KM: number;
  DELIVERY_MAX_KM: number;
  ORDERING_HOURS_ENFORCED: number; // 1 = only accept orders during opening hours
  DEFAULT_PREP_MINUTES: number; // kitchen one-tap accept uses this cooking time
}

export type OrderingMode = 'NORMAL' | 'BUSY' | 'PAUSED';

export interface BusyMode {
  mode: OrderingMode;
  busyExtraMinutes: number; // added to the usual wait while BUSY
  pauseMessage: string; // what customers see while PAUSED
}

export interface OpenStatus extends BusyMode {
  isOpen: boolean;
  closedReason: 'HOURS' | 'PAUSED' | null;
  enforced: boolean;
  nextOpening: { dayOfWeek: string; time: string; inDays: number } | null;
  timeZone: string;
  defaultPrepMinutes: number; // usual cooking time (Settings)
}

export interface BusyModeInput {
  mode: OrderingMode;
  extraMinutes?: number; // required for BUSY
  pauseMessage?: string; // '' = default text
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
  nameTh?: string | null; // optional Thai; the Thai site falls back to English
  descriptionTh?: string | null;
  category: string;
  costPrice: number;
  sellingPrice: number;
  imageUrl?: string;
  isAvailable: boolean;
  // Stock does not cover one portion (recipe ingredient ran out); ordering is refused.
  soldOut?: boolean;
  createdAt: string;
  modifierGroups?: ModifierGroup[]; // in display order
}

/** One option, e.g. "Large" (+20). Prices arrive as strings (Decimal). */
export interface Modifier {
  id: string;
  name: string;
  priceDelta: number | string;
  isAvailable: boolean;
}

/** A choice on a menu item, e.g. "Size": pick between minSelect and maxSelect options. */
export interface ModifierGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  modifiers: Modifier[];
}

export interface ModifierGroupInput {
  id?: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  modifiers: { id?: string; name: string; priceDelta: number; isAvailable: boolean }[];
}

export interface OrderItemModifier {
  id: string;
  groupName: string;
  name: string;
  priceDelta: number | string;
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  nameSnapshot: string;
  unitPrice: number; // includes the options
  unitCost: number;
  quantity: number;
  note?: string | null;
  modifiers?: OrderItemModifier[];
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

export type PaymentMethod = 'CASH' | 'PROMPTPAY';
export type PaymentStatus = 'UNPAID' | 'PENDING' | 'PAID' | 'REFUNDED';

export interface PaymentRecord {
  method: PaymentMethod;
  status: 'PAID' | 'REFUNDED';
  amount: number;
  providerRef?: string | null;
  note?: string | null;
  createdAt: string;
  confirmedBy?: { name: string } | null;
}

export interface PromptPayQr {
  payload: string; // text to encode in the QR
  amount: number;
  promptPayName: string;
}

export interface PaymentOptions {
  cash: boolean;
  promptPay: boolean;
  promptPayName: string;
}

export interface PaymentSettings {
  promptPayId: string; // '' = PromptPay off
  promptPayName: string;
}

export type OrderType = 'PICKUP' | 'DELIVERY' | 'DINE_IN';

/** Dine-in: the table visit an order belongs to (staff views). */
export interface OrderTableVisit {
  id: string;
  tableId: string | null;
  tableLabel: string;
  zoneName: string;
  confirmedAt: string | null;
  closedAt: string | null;
}

export interface Order {
  id: string;
  userId: string | null; // null for dine-in guests who order from the table's QR code
  items: OrderItem[];
  type: OrderType;
  tableSession?: OrderTableVisit | null;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paidAt?: string | null;
  payments?: PaymentRecord[]; // staff views only
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
  items: { menuItemId: string; quantity: number; modifierIds: string[]; note?: string }[];
  type: 'PICKUP' | 'DELIVERY';
  deliveryAddress?: string;
  deliveryLat?: number;
  deliveryLng?: number;
}

/** A delivery address the customer saved, with its map pin. */
export interface SavedAddress {
  id: string;
  label: string; // e.g. "Home"
  text: string;
  lat: number;
  lng: number;
  note?: string | null; // for the driver
}

export type AddressInput = Omit<SavedAddress, 'id'>;

export interface PlaceOrderInput extends CheckoutInput {
  customerPhone: string;
  idempotencyKey: string; // one UUID per checkout attempt
  paymentMethod: PaymentMethod;
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

// --- Floor plan (dine-in) ---
// Sizes and positions are grid cells. rotation is 0, 45, 90 or 135 degrees.

export type TableShape = 'ROUND' | 'SQUARE' | 'RECT';
export type TableStatus = 'FREE' | 'SEATED' | 'ORDERED' | 'SERVED' | 'BILL_REQUESTED' | 'CLEANING';
export type DecorType = 'WALL' | 'BAR' | 'ENTRANCE' | 'PLANT' | 'KITCHEN' | 'STAIRS';

export interface DiningTable {
  id: string;
  zoneId: string;
  label: string;
  shape: TableShape;
  seats: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  status: TableStatus;
}

export interface DecorItem {
  type: DecorType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface FloorZone {
  id: string;
  name: string;
  sortOrder: number;
  width: number;
  height: number;
  decor: DecorItem[];
  tables: DiningTable[];
}

export interface ZoneInput {
  name: string;
  width: number;
  height: number;
}

export interface TableLayoutInput {
  id?: string;
  label: string;
  shape: TableShape;
  seats: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

/** An open table visit as the floor view shows it on a table. */
export interface VisitBrief {
  id: string;
  tableId: string | null;
  guests: number | null;
  confirmed: boolean;
  openedAt: string;
  staffCalledAt: string | null;
  billRequestedAt: string | null;
  total: number;
  orders: { waiting: number; cooking: number; ready: number; served: number };
}

export interface FloorView {
  zones: FloorZone[];
  visits: VisitBrief[];
}

/** A visit with every round (floor view side panel, guest page, bill). */
export interface TableVisit {
  id: string;
  tableLabel: string;
  zoneName: string;
  guests: number | null;
  confirmed: boolean;
  openedAt: string;
  staffCalledAt: string | null;
  billRequestedAt: string | null;
  closedAt: string | null;
  orders: {
    id: string;
    orderNumber: number | null;
    status: OrderStatus;
    createdAt: string;
    acceptedAt: string | null;
    estimatedReadyAt: string | null;
    total: number;
    items: { id: string; name: string; menuItemId: string; quantity: number; unitPrice: number; note: string | null; options: { groupName: string; name: string; priceDelta: number }[] }[];
  }[];
  totals: { subtotal: number; taxAmount: number; total: number };
}

export interface QrTable {
  id: string;
  label: string;
  seats: number;
  qrToken: string;
}

export interface QrZone {
  id: string;
  name: string;
  tables: QrTable[];
}

export interface LayoutInput {
  tables: TableLayoutInput[];
  decor: DecorItem[];
}
