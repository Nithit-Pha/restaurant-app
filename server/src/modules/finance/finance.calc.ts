// Pure, DB-free P&L math — the financial heart of the dashboard.
// Kept separate from finance.service.ts so it can be unit-tested in isolation.

export interface KpiInput {
  totalRevenue: number; // Σ Order.subtotal (net of tax), completed (DELIVERED) orders
  totalCOGS: number; // Σ Order.totalCost (cost price snapshot)
  totalOperatingExpenses: number; // Σ Expense.amount
  orderCount: number;
  expenseCount: number;
}

export interface Kpis {
  totalRevenue: number;
  totalCOGS: number;
  grossProfit: number;
  totalOperatingExpenses: number;
  netProfit: number;
  grossMarginPct: number;
  orderCount: number;
  expenseCount: number;
}

/** Round to 2 dp without binary float drift (e.g. 0.1 + 0.2). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * The P&L formula:
 *   Gross Profit = Revenue − COGS
 *   Net Profit   = Gross Profit − Operating Expenses
 */
export function computeKpis(input: KpiInput): Kpis {
  const totalRevenue = round2(input.totalRevenue);
  const totalCOGS = round2(input.totalCOGS);
  const totalOperatingExpenses = round2(input.totalOperatingExpenses);

  const grossProfit = round2(totalRevenue - totalCOGS);
  const netProfit = round2(grossProfit - totalOperatingExpenses);
  const grossMarginPct =
    totalRevenue > 0 ? round2((grossProfit / totalRevenue) * 100) : 0;

  return {
    totalRevenue,
    totalCOGS,
    grossProfit,
    totalOperatingExpenses,
    netProfit,
    grossMarginPct,
    orderCount: input.orderCount,
    expenseCount: input.expenseCount,
  };
}

// ---- Transaction history merge ----------------------------------------
export interface RawOrder {
  id: string;
  createdAt: string | Date;
  subtotal: number;
  type: string;
  status: string;
}
export interface RawExpense {
  id: string;
  date: string | Date;
  amount: number;
  category: string;
  description?: string | null;
}
export interface TxRow {
  id: string;
  kind: 'ORDER' | 'EXPENSE';
  date: string;
  label: string;
  category: string;
  amount: number; // + cash in, − cash out
  direction: 'IN' | 'OUT';
}

/**
 * Merge orders (cash in) and expenses (cash out) into one list,
 * newest first. Returns at most `limit` rows.
 */
export function mergeTransactions(
  orders: RawOrder[],
  expenses: RawExpense[],
  limit = 50,
): TxRow[] {
  const rows: TxRow[] = [
    ...orders.map((o) => ({
      id: o.id,
      kind: 'ORDER' as const,
      date: new Date(o.createdAt).toISOString(),
      label: `Order #${o.id.slice(0, 8)} (${o.type})`,
      category: o.status,
      amount: round2(o.subtotal),
      direction: 'IN' as const,
    })),
    ...expenses.map((e) => ({
      id: e.id,
      kind: 'EXPENSE' as const,
      date: new Date(e.date).toISOString(),
      label: e.description || 'Expense',
      category: e.category,
      amount: -round2(e.amount),
      direction: 'OUT' as const,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return rows.slice(0, limit);
}

// ---- Default date range (current calendar month) ----------------------
export function resolveRange(
  startDate?: Date,
  endDate?: Date,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const start =
    startDate ?? new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = endDate
    ? new Date(
        endDate.getFullYear(),
        endDate.getMonth(),
        endDate.getDate(),
        23,
        59,
        59,
        999,
      )
    : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}
