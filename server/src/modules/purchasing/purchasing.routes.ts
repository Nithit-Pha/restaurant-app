import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as ctrl from './purchasing.controller';
import { createPoSchema, updatePoSchema } from './purchasing.validation';
import { pricesSchema, receiveSchema } from './receiving.validation';

const router = Router();
router.use(authenticate, requireRole('STAFF', 'SUPER_ADMIN'));

// Staff see orders (to receive deliveries, slice 3d); only the owner makes and
// sends them until Settings → Permissions (slice 3e) allows staff.
router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.post('/', requireRole('SUPER_ADMIN'), validate(createPoSchema), ctrl.create);
router.patch('/:id', requireRole('SUPER_ADMIN'), validate(updatePoSchema), ctrl.update);
router.post('/:id/send', requireRole('SUPER_ADMIN'), ctrl.send);
router.post('/:id/cancel', requireRole('SUPER_ADMIN'), ctrl.cancel);

// Deliveries (Step 3d): staff receive; prices and closing are for the owner.
router.post('/:id/deliveries', validate(receiveSchema), ctrl.receive);
router.put('/:id/deliveries/:deliveryId/prices', requireRole('SUPER_ADMIN'), validate(pricesSchema), ctrl.prices);
router.post('/:id/complete', requireRole('SUPER_ADMIN'), ctrl.complete);

export default router;
