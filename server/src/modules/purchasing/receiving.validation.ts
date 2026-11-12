import { z } from 'zod';

const amount = z.number().min(0).max(1_000_000).refine((x) => Math.abs(Math.round(x * 1000) - x * 1000) < 1e-6, 'Use at most 3 decimals');
const price = z.number().min(0).max(10_000_000).refine((x) => Math.abs(Math.round(x * 100) - x * 100) < 1e-6, 'Use at most 2 decimals');

export const receiveSchema = z.object({
  lines: z.array(z.object({
    itemId: z.string().uuid(),
    amount, // in the ingredient's unit
    price: price.nullable().optional(), // owner only: what the line cost
  })).min(1).max(300)
    .refine((l) => new Set(l.map((x) => x.itemId)).size === l.length, 'A line is there twice')
    .refine((l) => l.some((x) => x.amount > 0), 'Enter what arrived'),
  note: z.string().trim().max(300).nullable().optional().transform((s) => s || null),
});

export const pricesSchema = z.object({
  lines: z.array(z.object({ lineId: z.string().uuid(), price: price.nullable() })).min(1).max(300),
});

export type ReceiveInput = z.infer<typeof receiveSchema>;
export type PricesInput = z.infer<typeof pricesSchema>;
