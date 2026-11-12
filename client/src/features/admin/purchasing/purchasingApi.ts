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
  priceMissing: boolean; // a delivery came in without its price yet
}

export interface PurchaseOrderItem {
  id: string;
  ingredientId: string;
  packs: number;
  ingredientName: string;
  unit: Unit;
  packName: string | null;
  packSize: string;
  received: string; // arrived so far, in the ingredient's unit
}

export interface PurchaseDelivery {
  id: string;
  receivedAt: string;
  receivedBy: { name: string } | null;
  note: string | null;
  priceTotal: string | null; // null = the owner has not added the price yet
  pricedBy: { name: string } | null;
  pricedAt: string | null;
  expenseId: string | null;
  lines: {
    id: string;
    purchaseOrderItemId: string;
    amount: string;
    price: string | null;
    purchaseOrderItem: { ingredientName: string; unit: Unit; packSize: string };
  }[];
}

export interface PurchaseOrder extends Omit<PurchaseOrderSummary, 'supplier' | 'lineCount' | 'priceMissing'> {
  supplier: {
    id: string; name: string; contactName: string | null; phone: string | null; lineId: string | null; email: string | null;
    address: string | null; note: string | null; isActive: boolean; leadTimeDays: number; cutOffTime: string | null; minOrder: string | null;
  };
  items: PurchaseOrderItem[];
  createdBy: { name: string } | null;
  sentBy: { name: string } | null;
  cancelledAt: string | null;
  receivedAt: string | null;
  deliveries: PurchaseDelivery[];
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
    // Step 3d: deliveries. Stock goes up (Stock); a priced delivery adds a Finance expense.
    receiveDelivery: builder.mutation<PurchaseOrder, { id: string; lines: { itemId: string; amount: number; price?: number | null }[]; note?: string | null }>({
      query: ({ id, ...body }) => ({ url: `/purchase-orders/${id}/deliveries`, method: 'POST', body }),
      invalidatesTags: ['PurchaseOrder', 'Stock', 'Finance'],
    }),
    setDeliveryPrices: builder.mutation<PurchaseOrder, { id: string; deliveryId: string; lines: { lineId: string; price: number | null }[] }>({
      query: ({ id, deliveryId, lines }) => ({ url: `/purchase-orders/${id}/deliveries/${deliveryId}/prices`, method: 'PUT', body: { lines } }),
      invalidatesTags: ['PurchaseOrder', 'Stock', 'Finance'],
    }),
    completePurchaseOrder: builder.mutation<PurchaseOrder, string>({
      query: (id) => ({ url: `/purchase-orders/${id}/complete`, method: 'POST' }),
      invalidatesTags: ['PurchaseOrder'],
    }),
  }),
});

export const {
  useGetPurchaseOrdersQuery, useGetPurchaseOrderQuery, useCreatePurchaseOrderMutation, useUpdatePurchaseOrderMutation,
  useSendPurchaseOrderMutation, useCancelPurchaseOrderMutation, useReceiveDeliveryMutation, useSetDeliveryPricesMutation,
  useCompletePurchaseOrderMutation,
} = api;
