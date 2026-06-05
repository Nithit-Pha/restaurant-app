import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as ctrl from './settings.controller';

const router = Router();

// Staff+ can read settings (they need to know the tax rate etc.)
router.get('/', authenticate, requireRole('STAFF', 'SUPER_ADMIN'), ctrl.getSettingsHandler);

// Super Admin only writes
router.put('/tax', authenticate, requireRole('SUPER_ADMIN'),
  validate(z.object({ value: z.number().min(0).max(1) })),
  ctrl.setTaxHandler
);
router.put('/delivery-fee', authenticate, requireRole('SUPER_ADMIN'),
  validate(z.object({
    baseFee: z.number().min(0).optional(),
    feePerKm: z.number().min(0).optional(),
    freeKm: z.number().min(0).optional(),
  })),
  ctrl.setDeliveryFeeHandler
);

export default router;
