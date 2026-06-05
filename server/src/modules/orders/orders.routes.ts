import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as ctrl from './orders.controller';

const router = Router();

const cartItemSchema = z.object({
  menuItemId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

const checkoutSchema = z.object({
  items: z.array(cartItemSchema).min(1),
  type: z.enum(['PICKUP', 'DELIVERY']),
  deliveryAddress: z.string().optional(),
  deliveryLat: z.number().optional(),
  deliveryLng: z.number().optional(),
});

const statusSchema = z.object({
  status: z.enum(['PENDING', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED']),
});

// User routes
router.post('/quote', authenticate, validate(checkoutSchema), ctrl.quoteHandler);
router.post('/', authenticate, validate(checkoutSchema), ctrl.placeOrderHandler);
router.get('/', authenticate, ctrl.myOrdersHandler);
router.get('/:id', authenticate, ctrl.getOrderHandler);

// Staff+ routes
router.get('/admin/all', authenticate, requireRole('STAFF', 'SUPER_ADMIN'), ctrl.adminOrdersHandler);
router.patch('/:id/status', authenticate, requireRole('STAFF', 'SUPER_ADMIN'), validate(statusSchema), ctrl.updateStatusHandler);

export default router;
