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
  // Ordering (Step 3)
  supplierId: string | null;
  supplier: { id: string; name: string; isActive: boolean } | null;
  packName: string | null; // e.g. "bag 5 kg"
  packSize: string; // how much one pack holds, in the ingredient's unit
  targetLevel: string | null; // fill up to this when ordering
  emergencyLevel: string | null; // order at once below this
  lastPackPrice: string | null;
  emergency: boolean;
  orderPacks: number; // packs to order now (0 when not low)
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

export interface RecipeLine {
  ingredientId: string;
  amount: string; // per portion, in the ingredient's unit
  ingredient: { name: string; unit: Unit; isActive: boolean };
}

export interface IngredientInput {
  name: string;
  unit: Unit;
  reorderLevel: number;
  storage?: string;
  openingStock?: number;
  supplierId?: string | null;
  packName?: string | null;
  packSize?: number;
  targetLevel?: number | null;
  emergencyLevel?: number | null;
}

export type IngredientPatch = Partial<Omit<IngredientInput, 'openingStock' | 'storage'>> & {
  storage?: string | null;
  isActive?: boolean;
};

const stockApi = apiSlice.injectEndpoints({
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
      invalidatesTags: ['Stock', 'Supplier'],
    }),
    updateIngredient: builder.mutation<Ingredient, { id: string; patch: IngredientPatch }>({
      query: ({ id, patch }) => ({ url: `/stock/ingredients/${id}`, method: 'PATCH', body: patch }),
      invalidatesTags: ['Stock', 'Supplier'],
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
    getRecipe: builder.query<RecipeLine[], string>({
      query: (menuItemId) => `/stock/recipes/${menuItemId}`,
      providesTags: (_r, _e, menuItemId) => [{ type: 'Stock', id: `recipe-${menuItemId}` }],
    }),
    // A recipe decides whether a dish is sold out, so the menu reloads too.
    saveRecipe: builder.mutation<RecipeLine[], { menuItemId: string; items: { ingredientId: string; amount: number }[] }>({
      query: ({ menuItemId, items }) => ({ url: `/stock/recipes/${menuItemId}`, method: 'PUT', body: { items } }),
      invalidatesTags: (_r, _e, { menuItemId }) => [{ type: 'Stock', id: `recipe-${menuItemId}` }, 'MenuItem'],
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
  useGetRecipeQuery,
  useSaveRecipeMutation,
} = stockApi;

/** "2.5" -> "2.5", "2.500" -> "2.5", "-0.250" -> "−0.25": up to 3 decimals, no trailing zeros. */
export function formatAmount(value: string | number, locale = 'en'): string {
  return new Intl.NumberFormat(locale === 'th' ? 'th-TH' : 'en-US', { maximumFractionDigits: 3 }).format(Number(value));
}
