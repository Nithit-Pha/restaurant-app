import { z } from 'zod';

// Schemas matching the key/value settings API in settings.routes.ts.
// Routes currently inline these; import from here to keep them in one place.

/** PUT /api/settings/tax — tax rate as a fraction (0.07 = 7%), capped at 1. */
export const updateTaxSchema = z.object({
  value: z
    .number({ invalid_type_error: 'value must be a number' })
    .min(0, 'tax rate cannot be negative')
    .max(1, 'tax rate must be a fraction (e.g. 0.07 for 7%)'),
});

/** PUT /api/settings/delivery-fee — any subset of the delivery-fee tunables. */
export const updateDeliveryFeeSchema = z
  .object({
    baseFee: z.number().min(0, 'base fee cannot be negative'),
    feePerKm: z.number().min(0, 'per-km rate cannot be negative'),
    freeKm: z.number().min(0, 'free radius cannot be negative'),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, {
    message: 'provide at least one delivery-fee field',
  });

export type UpdateTaxInput = z.infer<typeof updateTaxSchema>;
export type UpdateDeliveryFeeInput = z.infer<typeof updateDeliveryFeeSchema>;
