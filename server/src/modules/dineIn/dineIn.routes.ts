import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as ctrl from './dineIn.controller';

const router = Router();

const tableOrderSchema = z.object({
  items: z.array(z.object({
    menuItemId: z.string().uuid(),
    quantity: z.number().int().min(1).max(50),
    modifierIds: z.array(z.string().uuid()).max(50).default([]),
    note: z.string().trim().max(200).optional(),
  })).min(1).max(50),
  idempotencyKey: z.string().uuid().optional(),
});

const confirmSchema = z.object({ guests: z.number().int().min(1).max(99).optional() });

// Guests at a table (no account): the QR code's token is in the address,
// their visit key in the X-Visit-Key header. Rate limited in app.ts.
router.get('/t/:qrToken', ctrl.table);
router.post('/t/:qrToken/join', ctrl.join);
router.post('/t/:qrToken/orders', validate(tableOrderSchema), ctrl.order);
router.get('/visit', ctrl.visit);
router.post('/visit/call-staff', ctrl.callStaff);
router.post('/visit/request-bill', ctrl.requestBill);

// Staff
router.post('/visits/:id/confirm', authenticate, requireRole('STAFF', 'SUPER_ADMIN'), validate(confirmSchema), ctrl.confirm);

export default router;
