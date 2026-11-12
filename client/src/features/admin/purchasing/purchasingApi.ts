// RTK Query endpoints for purchase orders (Step 3b), injected into the root apiSlice.
import { apiSlice } from '../../../api/apiSlice';
import type { Unit } from '../stock/stockApi';

export type PoStatus = 'DRAFT' | 'SENT' | 'PARTLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';
export type PoSource = 'MANUAL' | 'SCHEDULED' | 'EMERGENCY';

export interface PurchaseOrderSummary {
  id: string;
  number: number;
  label: string; // PO-0001
  status: PoStatus;
  source: PoSource;
  orderDay: string | null;
  expectedDate: string | null;
  note: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  supplier: { id: string; name: string };
  lineCount: number;
}

export interface PurchaseOrderItem {
  id: string;
  ingredientId: string;
  packs: number;
  ingredientName: string;
  unit: Unit;
  packName: string | null;
  packSize: string;
}

export interface PurchaseOrder extends Omit<PurchaseOrderSummary, 'supplier' | 'lineCount'> {
  supplier: {
    id: string; name: string; contactName: string | null; phone: string | null; lineId: string | null; email: string | null;
    address: string | null; note: string | null; isActive: boolean; leadTimeDays: number; cutOffTime: string | null; minOrder: string | null;
  };
  items: PurchaseOrderItem[];
  createdBy: { name: string } | null;
  sentBy: { name: string } | null;
  cancelledAt: string | null;
}

export interface PoLine { ingredientId: string; packs: number }

const api = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getPurchaseOrders: builder.query<PurchaseOrderSummary[], { status?: PoStatus[] } | void>({
      query: (arg) => `/purchase-orders${arg?.status?.length ? `?status=${arg.status.join(',')}` : ''}`,
      providesTags: ['PurchaseOrder'],
    }),
    getPurchaseOrder: builder.query<PurchaseOrder, string>({
      query: (id) => `/purchase-orders/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'PurchaseOrder', id }],
    }),
    // Without items the order starts with the suggested lines (low ingredients, filled to target).
    createPurchaseOrder: builder.mutation<PurchaseOrder, { supplierId: string; items?: PoLine[]; expectedDate?: string | null; note?: string | null }>({
      query: (body) => ({ url: '/purchase-orders', method: 'POST', body }),
      invalidatesTags: ['PurchaseOrder'],
    }),
    updatePurchaseOrder: builder.mutation<PurchaseOrder, { id: string; items?: PoLine[]; expectedDate?: string | null; note?: string | null }>({
      query: ({ id, ...body }) => ({ url: `/purchase-orders/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['PurchaseOrder'],
    }),
    sendPurchaseOrder: builder.mutation<PurchaseOrder, string>({
      query: (id) => ({ url: `/purchase-orders/${id}/send`, method: 'POST' }),
      invalidatesTags: ['PurchaseOrder'],
    }),
    cancelPurchaseOrder: builder.mutation<PurchaseOrder, string>({
      query: (id) => ({ url: `/purchase-orders/${id}/cancel`, method: 'POST' }),
      invalidatesTags: ['PurchaseOrder'],
    }),
  }),
});

export const {
  useGetPurchaseOrdersQuery, useGetPurchaseOrderQuery, useCreatePurchaseOrderMutation, useUpdatePurchaseOrderMutation,
  useSendPurchaseOrderMutation, useCancelPurchaseOrderMutation,
} = api;
