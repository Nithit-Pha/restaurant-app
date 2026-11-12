import { z } from 'zod';

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-15');
const note = z.string().trim().max(500).nullable().optional().transform((s) => (s ? s : null));

const lines = z.array(z.object({
  ingredientId: z.string().uuid(),
  packs: z.number().int('Use whole packs').min(1, 'At least 1 pack').max(9999, 'That is too many packs'),
})).max(300).refine((l) => new Set(l.map((x) => x.ingredientId)).size === l.length, 'An ingredient is on the order twice');

export const createPoSchema = z.object({
  supplierId: z.string().uuid(),
  // Left out: start with the suggested lines (low ingredients, filled to target).
  items: lines.optional(),
  expectedDate: ymd.nullable().optional(),
  note,
});

export const updatePoSchema = z.object({
  items: lines.optional(),
  expectedDate: ymd.nullable().optional(),
  note,
}).refine((d) => Object.keys(d).length > 0, 'Nothing to change');

export type CreatePoInput = z.infer<typeof createPoSchema>;
export type UpdatePoInput = z.infer<typeof updatePoSchema>;
export type PoLine = { ingredientId: string; packs: number };
