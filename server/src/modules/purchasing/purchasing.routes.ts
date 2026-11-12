import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import { requirePermission } from '../../middleware/requirePermission';
import * as ctrl from './purchasing.controller';
import { createPoSchema, updatePoSchema } from './purchasing.validation';
import { pricesSchema, receiveSchema } from './receiving.validation';

const router = Router();
router.use(authenticate, requireRole('STAFF', 'SUPER_ADMIN'));

// Staff see orders. Making, sending, cancelling and closing them, receiving
// and prices: owner, or staff as allowed on Settings → Permissions.
router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.post('/', requirePermission('orders.purchase'), validate(createPoSchema), ctrl.create);
router.patch('/:id', requirePermission('orders.purchase'), validate(updatePoSchema), ctrl.update);
router.post('/:id/send', requirePermission('orders.purchase'), ctrl.send);
router.post('/:id/cancel', requirePermission('orders.purchase'), ctrl.cancel);
router.post('/:id/complete', requirePermission('orders.purchase'), ctrl.complete);

// Deliveries (Step 3d). A price on a delivery also needs 'prices.enter' (service).
router.post('/:id/deliveries', requirePermission('deliveries.receive'), validate(receiveSchema), ctrl.receive);
router.put('/:id/deliveries/:deliveryId/prices', requirePermission('prices.enter'), validate(pricesSchema), ctrl.prices);

export default router;
