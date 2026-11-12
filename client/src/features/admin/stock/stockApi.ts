// RTK Query endpoints for ingredient stock (Step 2), injected into the root apiSlice.
import { apiSlice } from '../../../api/apiSlice';

export const UNITS = ['kg', 'g', 'L', 'ml', 'pcs', 'pack'] as const;
export type Unit = (typeof UNITS)[number];

export type StockMoveType = 'SALE' | 'SALE_RETURN' | 'PURCHASE' | 'COUNT_ADJUST' | 'WASTE';

// Decimals arrive as strings ("2.500"); convert with Number() before maths.
export interface Ingredient {
  id: string;
  name: string;
  unit: Unit;
  quantity: string;
  reorderLevel: string;
  storage: string | null;
  isActive: boolean;
  low: boolean;
}

export interface StockMovement {
  id: string;
  type: StockMoveType;
  change: string;
  quantityAfter: string;
  reason: string | null;
  createdAt: string;
  ingredient: { id: string; name: string; unit: Unit };
  user: { name: string } | null;
}

export interface IngredientInput {
  name: string;
  unit: Unit;
  reorderLevel: number;
  storage?: string;
  openingStock?: number;
}

export type IngredientPatch = Partial<Omit<IngredientInput, 'openingStock' | 'storage'>> & {
  storage?: string | null;
  isActive?: boolean;
};

const stockApi = apiSlice.enhanceEndpoints({ addTagTypes: ['Stock', 'Finance'] }).injectEndpoints({
  endpoints: (builder) => ({
    getIngredients: builder.query<Ingredient[], { all?: boolean } | void>({
      query: (arg) => `/stock/ingredients${arg?.all ? '?all=true' : ''}`,
      providesTags: ['Stock'],
    }),
    getStockMovements: builder.query<StockMovement[], { ingredientId?: string; limit?: number } | void>({
      query: (arg) => {
        const p = new URLSearchParams();
        if (arg?.ingredientId) p.set('ingredientId', arg.ingredientId);
        if (arg?.limit) p.set('limit', String(arg.limit));
        const qs = p.toString();
        return `/stock/movements${qs ? `?${qs}` : ''}`;
      },
      providesTags: ['Stock'],
    }),
    createIngredient: builder.mutation<Ingredient, IngredientInput>({
      query: (body) => ({ url: '/stock/ingredients', method: 'POST', body }),
      invalidatesTags: ['Stock'],
    }),
    updateIngredient: builder.mutation<Ingredient, { id: string; patch: IngredientPatch }>({
      query: ({ id, patch }) => ({ url: `/stock/ingredients/${id}`, method: 'PATCH', body: patch }),
      invalidatesTags: ['Stock'],
    }),
    // A priced stock in also adds a Finance expense, so Finance reloads too.
    stockIn: builder.mutation<StockMovement, { id: string; amount: number; price?: number; note?: string }>({
      query: ({ id, ...body }) => ({ url: `/stock/ingredients/${id}/in`, method: 'POST', body }),
      invalidatesTags: ['Stock', 'Finance'],
    }),
    countStock: builder.mutation<StockMovement, { id: string; counted: number; note?: string }>({
      query: ({ id, ...body }) => ({ url: `/stock/ingredients/${id}/count`, method: 'POST', body }),
      invalidatesTags: ['Stock'],
    }),
    wasteStock: builder.mutation<StockMovement, { id: string; amount: number; reason: string }>({
      query: ({ id, ...body }) => ({ url: `/stock/ingredients/${id}/waste`, method: 'POST', body }),
      invalidatesTags: ['Stock'],
    }),
  }),
});

export const {
  useGetIngredientsQuery,
  useGetStockMovementsQuery,
  useCreateIngredientMutation,
  useUpdateIngredientMutation,
  useStockInMutation,
  useCountStockMutation,
  useWasteStockMutation,
} = stockApi;

/** "2.5" -> "2.5", "2.500" -> "2.5", "-0.250" -> "−0.25": up to 3 decimals, no trailing zeros. */
export function formatAmount(value: string | number, locale = 'en'): string {
  return new Intl.NumberFormat(locale === 'th' ? 'th-TH' : 'en-US', { maximumFractionDigits: 3 }).format(Number(value));
}
