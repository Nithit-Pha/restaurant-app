import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { RootState } from '../app/store';

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api',
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as RootState).auth.accessToken;
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      return headers;
    },
  }),
  tagTypes: ['MenuItem', 'Order', 'User', 'Settings', 'Staff', 'Finance'],
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
    }),
    updateMenuItem: builder.mutation<MenuItem, { id: string; data: FormData | Partial<MenuItem> }>({
      query: ({ id, data }) => ({ url: `/menu/${id}`, method: 'PUT', body: data }),
      invalidatesTags: ['MenuItem'],
    }),
    toggleAvailability: builder.mutation<MenuItem, { id: string; isAvailable: boolean }>({
      query: ({ id, isAvailable }) => ({
        url: `/menu/${id}/availability`,
        method: 'PATCH',
        body: { isAvailable },
      }),
      invalidatesTags: ['MenuItem'],
    }),
    deleteMenuItem: builder.mutation<void, string>({
      query: (id) => ({ url: `/menu/${id}`, method: 'DELETE' }),
      invalidatesTags: ['MenuItem'],
    }),

    // Orders
    quoteOrder: builder.mutation<PricingResult, CheckoutInput>({
      query: (body) => ({ url: '/orders/quote', method: 'POST', body }),
    }),
    placeOrder: builder.mutation<Order, CheckoutInput>({
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
    getAdminOrders: builder.query<Order[], { status?: string }>({
      query: ({ status } = {}) => `/orders/admin/all${status ? `?status=${status}` : ''}`,
      providesTags: ['Order'],
    }),
    updateOrderStatus: builder.mutation<Order, { id: string; status: string }>({
      query: ({ id, status }) => ({ url: `/orders/${id}/status`, method: 'PATCH', body: { status } }),
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
    setDeliveryFee: builder.mutation<void, { baseFee?: number; feePerKm?: number; freeKm?: number }>({
      query: (body) => ({ url: '/settings/delivery-fee', method: 'PUT', body }),
      invalidatesTags: ['Settings'],
    }),

    // Staff management (Super Admin only)
    getStaff: builder.query<StaffUser[], void>({
      query: () => '/admin/staff',
      providesTags: ['Staff'],
    }),
    createStaff: builder.mutation<StaffUser, { name: string; email: string; password: string; role: 'STAFF' | 'SUPER_ADMIN' }>({
      query: (body) => ({ url: '/admin/staff', method: 'POST', body }),
      invalidatesTags: ['Staff'],
    }),
    updateStaffRole: builder.mutation<StaffUser, { id: string; role: string }>({
      query: ({ id, role }) => ({ url: `/admin/staff/${id}/role`, method: 'PATCH', body: { role } }),
      invalidatesTags: ['Staff'],
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
  useGetStaffQuery,
  useCreateStaffMutation,
  useUpdateStaffRoleMutation,
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
} = apiSlice;

// --- Types ---
export interface User {
  id: string;
  name: string;
  email: string;
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
}

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: 'STAFF' | 'SUPER_ADMIN';
  createdAt: string;
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

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  type: 'PICKUP' | 'DELIVERY';
  status: 'PENDING' | 'PREPARING' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';
  deliveryAddress?: string;
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

interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

interface LoginInput {
  email: string;
  password: string;
}

interface RegisterInput {
  name: string;
  email: string;
  password: string;
}
