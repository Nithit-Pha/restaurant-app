import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as ctrl from './orders.controller';
import { CANCEL_REASONS } from './orderStateMachine';

const router = Router();

const cartItemSchema = z.object({
  menuItemId: z.string().uuid(),
  quantity: z.number().int().positive(),
  modifierIds: z.array(z.string().uuid()).max(50).default([]),
  note: z.string().trim().max(200).optional(), // for the kitchen, e.g. "no peanuts"
});

const checkoutSchema = z.object({
  items: z.array(cartItemSchema).min(1),
  type: z.enum(['PICKUP', 'DELIVERY']),
  // Address (300) plus the driver's note (200), as "address · Note: note".
  deliveryAddress: z.string().trim().max(520).optional(),
  deliveryLat: z.number().min(-90).max(90).optional(),
  deliveryLng: z.number().min(-180).max(180).optional(),
});

// Placing a delivery order needs an address for the driver. (The quote route
// keeps the plain schema so checkout can show a price before it's typed.)
// Phone so staff/riders can reach the customer: digits, spaces, dashes, optional +.
const phoneSchema = z
  .string({ required_error: 'Phone number is required' })
  .trim()
  .regex(/^\+?[0-9][0-9 -]{7,18}$/, 'Please enter a valid phone number');

const placeOrderSchema = checkoutSchema.extend({
  customerPhone: phoneSchema,
  // One UUID per checkout attempt; a retry with the same key returns the same order.
  idempotencyKey: z.string().uuid().optional(),
  paymentMethod: z.enum(['CASH', 'PROMPTPAY']).default('CASH'),
}).refine(
  (d) => d.type !== 'DELIVERY' || !!d.deliveryAddress,
  { message: 'Delivery address is required for delivery orders', path: ['deliveryAddress'] },
);

const statusSchema = z.object({
  status: z.enum(['PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED']),
  prepMinutes: z.number().int().min(1).max(240).optional(),
  cancelReason: z.enum(CANCEL_REASONS as [string, ...string[]]).optional(),
  cancelNote: z.string().trim().max(300).optional(),
});

const customerCancelSchema = z.object({ note: z.string().trim().max(300).optional() });

const markPaidSchema = z.object({
  providerRef: z.string().trim().max(100).optional(), // e.g. the transfer reference from the bank app
  note: z.string().trim().max(300).optional(),
});
const refundSchema = z.object({ note: z.string().trim().max(300).optional() });

// User routes
router.post('/quote', authenticate, validate(checkoutSchema), ctrl.quoteHandler);
router.post('/', authenticate, validate(placeOrderSchema), ctrl.placeOrderHandler);
router.get('/', authenticate, ctrl.myOrdersHandler);
router.get('/:id', authenticate, ctrl.getOrderHandler);
router.post('/:id/cancel', authenticate, validate(customerCancelSchema), ctrl.cancelMyOrderHandler);
router.get('/:id/promptpay', authenticate, ctrl.promptPayQrHandler);
router.post('/:id/payment/sent', authenticate, ctrl.paymentSentHandler);

// Staff+ routes
router.get('/admin/all', authenticate, requireRole('STAFF', 'SUPER_ADMIN'), ctrl.adminOrdersHandler);
router.patch('/:id/status', authenticate, requireRole('STAFF', 'SUPER_ADMIN'), validate(statusSchema), ctrl.updateStatusHandler);
router.post('/:id/payment/paid', authenticate, requireRole('STAFF', 'SUPER_ADMIN'), validate(markPaidSchema), ctrl.markPaidHandler);
router.post('/:id/payment/refund', authenticate, requireRole('SUPER_ADMIN'), validate(refundSchema), ctrl.refundHandler);

export default router;
