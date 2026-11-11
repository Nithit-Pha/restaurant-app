import { Prisma } from '@prisma/client';
import { prisma } from '../../config/db';
import type {
  CreateExpenseInput,
  UpdateExpenseInput,
} from './finance.validation';
import { computeKpis, mergeTransactions, resolveRange } from './finance.calc';
import { env } from '../../config/env';
import { zonedDayRange } from '../../utils/businessTime';


// Helpers ---------------------------------------------------------------
const D = (v: Prisma.Decimal | number | string) => new Prisma.Decimal(v);
const num = (v: Prisma.Decimal) => Number(v.toFixed(2));

// =====================================================================
// FINANCE DASHBOARD
// =====================================================================
export async function getDashboard(startDate?: string, endDate?: string) {
  const { start, end } = resolveRange(startDate, endDate, env.businessTimeZone);

  // Revenue = completed orders only (same definition as the profit report).
  // Pending or in-progress orders may still be cancelled.
  const revenueStatuses: Prisma.OrderWhereInput = {
    status: 'DELIVERED',
    createdAt: { gte: start, lte: end },
  };

  const [orderAgg, expenseAgg, expenseByCategory] = await Promise.all([
    prisma.order.aggregate({
      where: revenueStatuses,
      _sum: { subtotal: true, totalCost: true },
      _count: { _all: true },
    }),
    prisma.expense.aggregate({
      where: { date: { gte: start, lte: end } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.expense.groupBy({
      by: ['category'],
      where: { date: { gte: start, lte: end } },
      _sum: { amount: true },
    }),
  ]);

  // Hand the raw numbers to the pure, unit-tested calculator.
  const kpis = computeKpis({
    totalRevenue: num(orderAgg._sum.subtotal ?? D(0)),
    totalCOGS: num(orderAgg._sum.totalCost ?? D(0)),
    totalOperatingExpenses: num(expenseAgg._sum.amount ?? D(0)),
    orderCount: orderAgg._count._all,
    expenseCount: expenseAgg._count._all,
  });

  return {
    range: { startDate: start.toISOString(), endDate: end.toISOString() },
    kpis,
    expensesByCategory: expenseByCategory.map((g) => ({
      category: g.category,
      amount: num(g._sum.amount ?? D(0)),
    })),
  };
}

/**
 * Combined, chronologically-sorted transaction history
 * (latest orders + latest expenses).
 */
export async function getTransactionHistory(
  startDate?: string,
  endDate?: string,
  limit = 50,
) {
  const { start, end } = resolveRange(startDate, endDate, env.businessTimeZone);

  const [orders, expenses] = await Promise.all([
    prisma.order.findMany({
      where: { status: 'DELIVERED', createdAt: { gte: start, lte: end } },
      select: {
        id: true,
        createdAt: true,
        subtotal: true,
        totalCost: true,
        type: true,
        status: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.expense.findMany({
      where: { date: { gte: start, lte: end } },
      orderBy: { date: 'desc' },
      take: limit,
    }),
  ]);

  return mergeTransactions(
    orders.map((o) => ({
      id: o.id,
      createdAt: o.createdAt,
      subtotal: num(D(o.subtotal)),
      type: o.type,
      status: o.status,
    })),
    expenses.map((e) => ({
      id: e.id,
      date: e.date,
      amount: num(D(e.amount)),
      category: e.category,
      description: e.description,
    })),
    limit,
  );
}

// =====================================================================
// EXPENSE CRUD
// =====================================================================
export async function listExpenses(startDate?: string, endDate?: string) {
  const where: Prisma.ExpenseWhereInput = {};
  if (startDate || endDate) {
    where.date = {};
    const tz = env.businessTimeZone;
    if (startDate) (where.date as Prisma.DateTimeFilter).gte = zonedDayRange(startDate, tz).start;
    if (endDate) (where.date as Prisma.DateTimeFilter).lte = zonedDayRange(endDate, tz).end;
  }
  return prisma.expense.findMany({ where, orderBy: { date: 'desc' } });
}

export async function getExpense(id: string) {
  return prisma.expense.findUnique({ where: { id } });
}

export async function createExpense(input: CreateExpenseInput, userId?: string) {
  return prisma.expense.create({
    data: {
      amount: D(input.amount),
      category: input.category,
      date: input.date ?? new Date(),
      description: input.description,
      createdById: userId,
    },
  });
}

export async function updateExpense(id: string, input: UpdateExpenseInput) {
  const data: Prisma.ExpenseUpdateInput = {};
  if (input.amount !== undefined) data.amount = D(input.amount);
  if (input.category !== undefined) data.category = input.category;
  if (input.date !== undefined) data.date = input.date;
  if (input.description !== undefined) data.description = input.description;
  return prisma.expense.update({ where: { id }, data });
}

export async function deleteExpense(id: string) {
  return prisma.expense.delete({ where: { id } });
}
