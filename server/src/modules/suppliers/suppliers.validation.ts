import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max).optional().nullable().transform((s) => s || null);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 16:00').nullable().optional();
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-15').nullable().optional();

const fields = {
  name: z.string().trim().min(1, 'Give the supplier a name').max(80),
  contactName: text(80),
  phone: text(30),
  lineId: text(60),
  email: z.string().trim().email('Enter a valid email').max(120).optional().nullable().or(z.literal('').transform(() => null)),
  address: text(300),
  note: text(300),
  frequency: z.enum(['DAILY', 'WEEKLY', 'EVERY_N_DAYS', 'MONTHLY']),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7).default([]).transform((d) => [...new Set(d)].sort()),
  everyNDays: z.number().int().min(2).max(60).nullable().optional(),
  startDate: ymd,
  monthDay: z.number().int().min(1).max(31).nullable().optional(),
  draftTime: time, // null = when the restaurant closes the day before the order day
  cutOffTime: time,
  leadTimeDays: z.number().int().min(0).max(30).default(1),
  minOrder: z.number().min(0).max(10_000_000).nullable().optional(),
};

export const supplierSchema = z.object(fields);
export const supplierPatchSchema = z.object(fields).partial().extend({ isActive: z.boolean().optional() })
  .refine((d) => Object.keys(d).length > 0, 'Nothing to change');

// Tick list on the supplier: exactly these ingredients are delivered by it.
export const supplierIngredientsSchema = z.object({ ingredientIds: z.array(z.string().uuid()).max(500) });

export type SupplierInput = z.infer<typeof supplierSchema>;
export type SupplierPatch = z.infer<typeof supplierPatchSchema>;
