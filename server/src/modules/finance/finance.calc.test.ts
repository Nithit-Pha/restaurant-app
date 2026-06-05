import { describe, it, expect } from 'vitest';
import {
  computeKpis,
  mergeTransactions,
  resolveRange,
  round2,
  type RawOrder,
  type RawExpense,
} from './finance.calc';

describe('round2', () => {
  it('rounds to 2 decimals', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(10)).toBe(10);
  });

  it('avoids binary float drift', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});

describe('computeKpis — P&L formula', () => {
  it('computes gross and net profit correctly', () => {
    const k = computeKpis({
      totalRevenue: 1000,
      totalCOGS: 400,
      totalOperatingExpenses: 250,
      orderCount: 20,
      expenseCount: 5,
    });
    expect(k.grossProfit).toBe(600); // 1000 - 400
    expect(k.netProfit).toBe(350); // 600 - 250
    expect(k.grossMarginPct).toBe(60); // 600/1000 * 100
  });

  it('reports a negative net profit when expenses exceed gross profit', () => {
    const k = computeKpis({
      totalRevenue: 500,
      totalCOGS: 300,
      totalOperatingExpenses: 400,
      orderCount: 10,
      expenseCount: 8,
    });
    expect(k.grossProfit).toBe(200);
    expect(k.netProfit).toBe(-200); // 200 - 400 (operating at a loss)
  });

  it('handles zero revenue without dividing by zero', () => {
    const k = computeKpis({
      totalRevenue: 0,
      totalCOGS: 0,
      totalOperatingExpenses: 100,
      orderCount: 0,
      expenseCount: 2,
    });
    expect(k.grossMarginPct).toBe(0);
    expect(k.netProfit).toBe(-100);
  });

  it('rounds messy decimal sums cleanly', () => {
    const k = computeKpis({
      totalRevenue: 19.99 + 19.99 + 19.99, // 59.97
      totalCOGS: 6.66 + 6.66 + 6.66, // 19.98
      totalOperatingExpenses: 0,
      orderCount: 3,
      expenseCount: 0,
    });
    expect(k.totalRevenue).toBe(59.97);
    expect(k.totalCOGS).toBe(19.98);
    expect(k.grossProfit).toBe(39.99);
  });

  it('passes through counts unchanged', () => {
    const k = computeKpis({
      totalRevenue: 100,
      totalCOGS: 50,
      totalOperatingExpenses: 10,
      orderCount: 7,
      expenseCount: 3,
    });
    expect(k.orderCount).toBe(7);
    expect(k.expenseCount).toBe(3);
  });
});

describe('mergeTransactions', () => {
  const orders: RawOrder[] = [
    { id: 'aaaaaaaa-1', createdAt: '2026-06-02T10:00:00Z', subtotal: 50, type: 'PICKUP', status: 'DELIVERED' },
    { id: 'cccccccc-3', createdAt: '2026-06-04T10:00:00Z', subtotal: 80, type: 'DELIVERY', status: 'PREPARING' },
  ];
  const expenses: RawExpense[] = [
    { id: 'bbbbbbbb-2', date: '2026-06-03T09:00:00Z', amount: 200, category: 'RENT', description: 'June rent' },
  ];

  it('merges orders and expenses sorted newest-first', () => {
    const rows = mergeTransactions(orders, expenses);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.id)).toEqual(['cccccccc-3', 'bbbbbbbb-2', 'aaaaaaaa-1']);
  });

  it('marks revenue positive (IN) and expenses negative (OUT)', () => {
    const rows = mergeTransactions(orders, expenses);
    const order = rows.find((r) => r.kind === 'ORDER')!;
    const expense = rows.find((r) => r.kind === 'EXPENSE')!;
    expect(order.amount).toBeGreaterThan(0);
    expect(order.direction).toBe('IN');
    expect(expense.amount).toBe(-200);
    expect(expense.direction).toBe('OUT');
  });

  it('falls back to a generic label when an expense has no description', () => {
    const rows = mergeTransactions([], [
      { id: 'x', date: '2026-06-01T00:00:00Z', amount: 10, category: 'MISCELLANEOUS', description: null },
    ]);
    expect(rows[0].label).toBe('Expense');
  });

  it('respects the limit', () => {
    const many: RawExpense[] = Array.from({ length: 100 }, (_, i) => ({
      id: `e${i}`,
      date: new Date(2026, 5, 1, 0, i).toISOString(),
      amount: 1,
      category: 'LABOR',
    }));
    expect(mergeTransactions([], many, 25)).toHaveLength(25);
  });
});

describe('resolveRange', () => {
  it('defaults to the current calendar month', () => {
    const now = new Date(2026, 5, 15); // June 15 2026
    const { start, end } = resolveRange(undefined, undefined, now);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(5);
    expect(start.getDate()).toBe(1);
    expect(end.getMonth()).toBe(5);
    expect(end.getDate()).toBe(30); // June has 30 days
  });

  it('extends endDate to end-of-day so the boundary day is inclusive', () => {
    const end = resolveRange(new Date(2026, 5, 1), new Date(2026, 5, 10)).end;
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getDate()).toBe(10);
  });
});
