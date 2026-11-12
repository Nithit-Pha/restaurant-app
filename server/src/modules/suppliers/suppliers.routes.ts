import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as ctrl from './suppliers.controller';
import { supplierIngredientsSchema, supplierPatchSchema, supplierSchema } from './suppliers.validation';

const router = Router();
router.use(authenticate, requireRole('STAFF', 'SUPER_ADMIN'));

// Staff see suppliers (receiving deliveries); the owner manages them.
// (Settings → Permissions, slice 3e, can give staff more.)
router.get('/', ctrl.list);
router.post('/', requireRole('SUPER_ADMIN'), validate(supplierSchema), ctrl.create);
router.patch('/:id', requireRole('SUPER_ADMIN'), validate(supplierPatchSchema), ctrl.update);
router.put('/:id/ingredients', requireRole('SUPER_ADMIN'), validate(supplierIngredientsSchema), ctrl.setIngredients);

export default router;
