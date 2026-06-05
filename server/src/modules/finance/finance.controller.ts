import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import * as service from './finance.service';
import {
  createExpenseSchema,
  updateExpenseSchema,
  dashboardQuerySchema,
} from './finance.validation';

/**
 * Wraps an async handler so thrown errors flow to the central errorHandler.
 */
const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

// ---- GET /api/finance/dashboard ---------------------------------------
export const dashboard = handle(async (req, res) => {
  const parsed = dashboardQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid query', details: parsed.error.flatten() });
  }
  const { startDate, endDate } = parsed.data;
  const [summary, transactions] = await Promise.all([
    service.getDashboard(startDate, endDate),
    service.getTransactionHistory(startDate, endDate),
  ]);
  res.json({ ...summary, transactions });
});

// ---- GET /api/finance/expenses ----------------------------------------
export const listExpenses = handle(async (req, res) => {
  const parsed = dashboardQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid query', details: parsed.error.flatten() });
  }
  const data = await service.listExpenses(
    parsed.data.startDate,
    parsed.data.endDate,
  );
  res.json(data);
});

// ---- GET /api/finance/expenses/:id ------------------------------------
export const getExpense = handle(async (req, res) => {
  const expense = await service.getExpense(req.params.id);
  if (!expense) return res.status(404).json({ error: 'Expense not found' });
  res.json(expense);
});

// ---- POST /api/finance/expenses ---------------------------------------
export const createExpense = handle(async (req, res) => {
  const parsed = createExpenseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Validation failed', details: parsed.error.flatten() });
  }
  const created = await service.createExpense(parsed.data, req.user?.id);
  res.status(201).json(created);
});

// ---- PUT /api/finance/expenses/:id ------------------------------------
export const updateExpense = handle(async (req, res) => {
  const parsed = updateExpenseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Validation failed', details: parsed.error.flatten() });
  }
  try {
    const updated = await service.updateExpense(req.params.id, parsed.data);
    res.json(updated);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2025'
    ) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    throw err;
  }
});

// ---- DELETE /api/finance/expenses/:id ---------------------------------
export const deleteExpense = handle(async (req, res) => {
  try {
    await service.deleteExpense(req.params.id);
    res.status(204).send();
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2025'
    ) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    throw err;
  }
});
