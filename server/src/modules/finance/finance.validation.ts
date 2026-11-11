import { z } from 'zod';

export const EXPENSE_CATEGORIES = [
  'RENT',
  'LABOR',
  'UTILITIES',
  'FOOD_SUPPLY',
  'MARKETING',
  'MISCELLANEOUS',
] as const;

/** Body schema for creating an expense. Amount MUST be a positive number. */
export const createExpenseSchema = z.object({
  amount: z
    .number({ invalid_type_error: 'amount must be a number' })
    .positive('amount must be a positive number')
    .finite('amount must be a valid number'),
  category: z.enum(EXPENSE_CATEGORIES, {
    errorMap: () => ({ message: 'invalid expense category' }),
  }),
  date: z.coerce.date().optional(), // defaults to now() if omitted
  description: z.string().trim().max(500).optional(),
});

/** Update schema — all fields optional, but amount still positive if present. */
export const updateExpenseSchema = createExpenseSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'at least one field must be provided' },
);

/** Query schema for the dashboard date range: business days in the restaurant's time zone. */
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const dashboardQuerySchema = z
  .object({
    startDate: ymd.optional(),
    endDate: ymd.optional(),
  })
  .refine(
    (q) => !q.startDate || !q.endDate || q.startDate <= q.endDate,
    { message: 'startDate must be before or equal to endDate' },
  );

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
