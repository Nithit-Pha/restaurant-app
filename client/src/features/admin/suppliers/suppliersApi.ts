// RTK Query endpoints for suppliers (Step 3), injected into the root apiSlice.
import { apiSlice } from '../../../api/apiSlice';

export type OrderFrequency = 'DAILY' | 'WEEKLY' | 'EVERY_N_DAYS' | 'MONTHLY';
export const FREQUENCIES: OrderFrequency[] = ['DAILY', 'WEEKLY', 'EVERY_N_DAYS', 'MONTHLY'];

export interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  lineId: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
  isActive: boolean;
  frequency: OrderFrequency;
  weekdays: number[]; // 1 = Monday … 7 = Sunday
  everyNDays: number | null;
  startDate: string | null; // YYYY-MM-DD, first order day for "every N days"
  monthDay: number | null; // 1–31; short months use their last day
  draftTime: string | null; // null = when the restaurant closes the day before
  cutOffTime: string | null;
  leadTimeDays: number;
  minOrder: string | null;
  ingredients: { id: string; name: string }[];
  nextOrderDays: string[];
}

export type SupplierInput = Omit<Supplier, 'id' | 'isActive' | 'ingredients' | 'nextOrderDays' | 'minOrder'> & { minOrder: number | null };
export type SupplierPatch = Partial<SupplierInput> & { isActive?: boolean };

const api = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getSuppliers: builder.query<Supplier[], { all?: boolean } | void>({
      query: (arg) => `/suppliers${arg?.all ? '?all=true' : ''}`,
      providesTags: ['Supplier'],
    }),
    createSupplier: builder.mutation<Supplier, SupplierInput>({
      query: (body) => ({ url: '/suppliers', method: 'POST', body }),
      invalidatesTags: ['Supplier', 'Stock'],
    }),
    updateSupplier: builder.mutation<Supplier, { id: string; patch: SupplierPatch }>({
      query: ({ id, patch }) => ({ url: `/suppliers/${id}`, method: 'PATCH', body: patch }),
      invalidatesTags: ['Supplier', 'Stock'],
    }),
    // The tick list: exactly these ingredients come from this supplier.
    setSupplierIngredients: builder.mutation<Supplier, { id: string; ingredientIds: string[] }>({
      query: ({ id, ingredientIds }) => ({ url: `/suppliers/${id}/ingredients`, method: 'PUT', body: { ingredientIds } }),
      invalidatesTags: ['Supplier', 'Stock'],
    }),
  }),
});

export const {
  useGetSuppliersQuery, useCreateSupplierMutation, useUpdateSupplierMutation, useSetSupplierIngredientsMutation,
} = api;
