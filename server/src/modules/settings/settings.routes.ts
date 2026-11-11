import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as ctrl from './settings.controller';
import { parsePromptPayId } from '../../utils/promptpay';

const router = Router();

// Staff+ can read numeric settings (they need to know the tax rate etc.)
router.get('/', authenticate, requireRole('STAFF', 'SUPER_ADMIN'), ctrl.getSettingsHandler);

// Public: is online ordering open right now? (storefront + checkout banner)
router.get('/open-status', ctrl.getOpenStatusHandler);

// Restaurant profile: public read (storefront/SEO need it), Super Admin write.
router.get('/restaurant', ctrl.getRestaurantHandler);

const hoursSchema = z.object({
  dayOfWeek: z.array(z.string()).min(1),
  opens: z.string().regex(/^\d{2}:\d{2}$/),
  closes: z.string().regex(/^\d{2}:\d{2}$/),
});

const restaurantSchema = z.object({
  name: z.string().trim().min(1).max(120),
  legalName: z.string().trim().max(160).default(''),
  description: z.string().trim().max(600).default(''),
  telephone: z.string().trim().max(40).default(''),
  priceRange: z.string().trim().max(8).default('$$'),
  servesCuisine: z.array(z.string().trim()).default([]),
  address: z.object({
    streetAddress: z.string().trim().max(160).default(''),
    addressLocality: z.string().trim().max(120).default(''),
    addressRegion: z.string().trim().max(120).default(''),
    postalCode: z.string().trim().max(20).default(''),
    addressCountry: z.string().trim().max(4).default('US'),
  }),
  geo: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  openingHours: z.array(hoursSchema).default([]),
  sameAs: z.array(z.string().trim().url()).default([]),
});

router.put('/restaurant', authenticate, requireRole('SUPER_ADMIN'),
  validate(restaurantSchema),
  ctrl.setRestaurantHandler
);

// Numeric writes (Super Admin only)
router.put('/tax', authenticate, requireRole('SUPER_ADMIN'),
  validate(z.object({ value: z.number().min(0).max(1) })),
  ctrl.setTaxHandler
);
router.put('/delivery-fee', authenticate, requireRole('SUPER_ADMIN'),
  validate(z.object({
    baseFee: z.number().min(0).optional(),
    feePerKm: z.number().min(0).optional(),
    freeKm: z.number().min(0).optional(),
    maxKm: z.number().min(0).optional(),
  })),
  ctrl.setDeliveryFeeHandler
);

router.put('/ordering', authenticate, requireRole('SUPER_ADMIN'),
  validate(z.object({ hoursEnforced: z.boolean() })),
  ctrl.setOrderingHandler
);

// Busy mode: staff slow down or pause online ordering during a rush.
router.put('/busy', authenticate, requireRole('STAFF', 'SUPER_ADMIN'),
  validate(z.object({
    mode: z.enum(['NORMAL', 'BUSY', 'PAUSED']),
    extraMinutes: z.number().int().min(5).max(120).optional(),
    pauseMessage: z.string().trim().max(200).optional(), // '' = default text
  }).refine((b) => b.mode !== 'BUSY' || b.extraMinutes !== undefined, {
    message: 'Busy mode needs the extra minutes', path: ['extraMinutes'],
  })),
  ctrl.setBusyModeHandler
);

// Payment: public list of methods for checkout; PromptPay account for the owner.
router.get('/payment-options', ctrl.getPaymentOptionsHandler);
router.get('/payment', authenticate, requireRole('SUPER_ADMIN'), ctrl.getPaymentSettingsHandler);
router.put('/payment', authenticate, requireRole('SUPER_ADMIN'),
  validate(z.object({
    // '' switches PromptPay off at checkout.
    promptPayId: z.string().trim().refine((v) => v === '' || parsePromptPayId(v) !== null, {
      message: 'Enter a Thai mobile number, a 13-digit national/tax ID or a 15-digit e-wallet ID',
    }),
    promptPayName: z.string().trim().max(100).default(''),
  })),
  ctrl.setPaymentSettingsHandler
);

export default router;
