import { z } from 'zod';
import { MAX_AMOUNT, UNITS } from './stock.rules';
import { levelProblem } from '../suppliers/ordering';

// Up to 3 decimals, like the database columns (e.g. 0.125 kg).
const threeDecimals = (n: number) => Math.abs(Math.round(n * 1000) - n * 1000) < 1e-6;
const amount = z.number()
  .positive('Enter an amount above 0')
  .max(MAX_AMOUNT, 'That amount is too large')
  .refine(threeDecimals, 'Use at most 3 decimals');
const level = z.number().min(0, 'Cannot be below 0').max(MAX_AMOUNT, 'That amount is too large').refine(threeDecimals, 'Use at most 3 decimals');
const note = z.string().trim().max(200).optional();

// Ordering (Step 3): who delivers it, how it is bought, and the levels to order at.
const orderingFields = {
  supplierId: z.string().uuid().nullable().optional(),
  packName: z.string().trim().max(40).nullable().optional().transform((s) => (s === '' ? null : s)),
  packSize: amount.optional(), // how much one pack holds, in the ingredient's unit
  targetLevel: level.nullable().optional(),
  emergencyLevel: level.nullable().optional(),
};

// Checked here when the low-stock level comes with the others; the service checks the merged result too.
const levelsInOrder = (d: { reorderLevel?: number; targetLevel?: number | null; emergencyLevel?: number | null }, ctx: z.RefinementCtx) => {
  if (d.reorderLevel === undefined) return;
  const problem = levelProblem({ ...d, reorderLevel: d.reorderLevel });
  if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
};

export const ingredientSchema = z.object({
  name: z.string().trim().min(1, 'Give the ingredient a name').max(80),
  unit: z.enum(UNITS),
  reorderLevel: level.default(0),
  storage: z.string().trim().max(40).optional().transform((s) => s || undefined),
  // Stock already in the shop when the ingredient is added.
  openingStock: level.optional(),
  ...orderingFields,
}).superRefine(levelsInOrder);

export const ingredientPatchSchema = z.object({
  name: z.string().trim().min(1, 'Give the ingredient a name').max(80).optional(),
  unit: z.enum(UNITS).optional(),
  reorderLevel: level.optional(),
  storage: z.string().trim().max(40).nullable().optional().transform((s) => (s === '' ? null : s)),
  isActive: z.boolean().optional(),
  ...orderingFields,
}).refine((d) => Object.keys(d).length > 0, 'Nothing to change')
  .superRefine(levelsInOrder);

export const stockInSchema = z.object({
  amount,
  // Total price paid (THB). Owner only; creates a Finance "Food supply" expense.
  price: z.number().positive('Enter a price above 0').max(1_000_000).optional(),
  note,
});

export const countSchema = z.object({
  counted: level,
  note,
});

export const wasteSchema = z.object({
  amount,
  reason: z.string().trim().min(1, 'Say why it was thrown away').max(200),
});

// The whole recipe of one menu item; an empty list removes it.
export const recipeSchema = z.object({
  items: z.array(z.object({
    ingredientId: z.string().uuid(),
    amount, // per portion, in the ingredient's unit
  })).max(30, 'At most 30 ingredients per dish'),
});

export type IngredientInput = z.infer<typeof ingredientSchema>;
export type RecipeInput = z.infer<typeof recipeSchema>;
export type IngredientPatch = z.infer<typeof ingredientPatchSchema>;
export type StockInInput = z.infer<typeof stockInSchema>;
export type CountInput = z.infer<typeof countSchema>;
export type WasteInput = z.infer<typeof wasteSchema>;
