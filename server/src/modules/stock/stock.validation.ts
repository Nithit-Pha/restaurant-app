import { z } from 'zod';
import { MAX_AMOUNT, UNITS } from './stock.rules';

// Up to 3 decimals, like the database columns (e.g. 0.125 kg).
const threeDecimals = (n: number) => Math.abs(Math.round(n * 1000) - n * 1000) < 1e-6;
const amount = z.number()
  .positive('Enter an amount above 0')
  .max(MAX_AMOUNT, 'That amount is too large')
  .refine(threeDecimals, 'Use at most 3 decimals');
const level = z.number().min(0, 'Cannot be below 0').max(MAX_AMOUNT, 'That amount is too large').refine(threeDecimals, 'Use at most 3 decimals');
const note = z.string().trim().max(200).optional();

export const ingredientSchema = z.object({
  name: z.string().trim().min(1, 'Give the ingredient a name').max(80),
  unit: z.enum(UNITS),
  reorderLevel: level.default(0),
  storage: z.string().trim().max(40).optional().transform((s) => s || undefined),
  // Stock already in the shop when the ingredient is added.
  openingStock: level.optional(),
});

export const ingredientPatchSchema = z.object({
  name: z.string().trim().min(1, 'Give the ingredient a name').max(80).optional(),
  unit: z.enum(UNITS).optional(),
  reorderLevel: level.optional(),
  storage: z.string().trim().max(40).nullable().optional().transform((s) => (s === '' ? null : s)),
  isActive: z.boolean().optional(),
}).refine((d) => Object.keys(d).length > 0, 'Nothing to change');

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

export type IngredientInput = z.infer<typeof ingredientSchema>;
export type IngredientPatch = z.infer<typeof ingredientPatchSchema>;
export type StockInInput = z.infer<typeof stockInSchema>;
export type CountInput = z.infer<typeof countSchema>;
export type WasteInput = z.infer<typeof wasteSchema>;
