// RTK Query slice for the finance feature.
// Inject into your root apiSlice (createApi with baseQuery that attaches the JWT).
import { apiSlice } from '../../../api/apiSlice';

export interface DashboardKpis {
  totalRevenue: number;
  totalCOGS: number;
  grossProfit: number;
  totalOperatingExpenses: number;
  netProfit: number;
  grossMarginPct: number;
  orderCount: number;
  expenseCount: number;
}

export interface Transaction {
  id: string;
  kind: 'ORDER' | 'EXPENSE';
  date: string;
  label: string;
  category: string;
  amount: number; // positive = cash in, negative = cash out
  direction: 'IN' | 'OUT';
}

export interface DashboardResponse {
  range: { startDate: string; endDate: string };
  kpis: DashboardKpis;
  expensesByCategory: { category: string; amount: number }[];
  transactions: Transaction[];
}

export interface Expense {
  id: string;
  amount: string | number;
  category: string;
  date: string;
  description?: string | null;
}

export interface NewExpense {
  amount: number;
  category: string;
  date?: string;
  description?: string;
}

const qs = (range?: { startDate?: string; endDate?: string }) => {
  if (!range?.startDate && !range?.endDate) return '';
  const p = new URLSearchParams();
  if (range.startDate) p.set('startDate', range.startDate);
  if (range.endDate) p.set('endDate', range.endDate);
  return `?${p.toString()}`;
};

export const financeApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getDashboard: builder.query<DashboardResponse, { startDate?: string; endDate?: string } | void>({
      query: (range) => `/finance/dashboard${qs(range || undefined)}`,
      providesTags: ['Finance'],
    }),
    addExpense: builder.mutation<Expense, NewExpense>({
      query: (body) => ({ url: '/finance/expenses', method: 'POST', body }),
      invalidatesTags: ['Finance'],
    }),
    updateExpense: builder.mutation<Expense, { id: string; body: Partial<NewExpense> }>({
      query: ({ id, body }) => ({ url: `/finance/expenses/${id}`, method: 'PUT', body }),
      invalidatesTags: ['Finance'],
    }),
    deleteExpense: builder.mutation<void, string>({
      query: (id) => ({ url: `/finance/expenses/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Finance'],
    }),
  }),
});

export const {
  useGetDashboardQuery,
  useAddExpenseMutation,
  useUpdateExpenseMutation,
  useDeleteExpenseMutation,
} = financeApi;

// NOTE: add 'Finance' to your apiSlice tagTypes array.
