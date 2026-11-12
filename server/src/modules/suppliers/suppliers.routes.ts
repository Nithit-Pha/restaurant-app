import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import { requirePermission } from '../../middleware/requirePermission';
import * as ctrl from './suppliers.controller';
import { supplierIngredientsSchema, supplierPatchSchema, supplierSchema } from './suppliers.validation';

const router = Router();
router.use(authenticate, requireRole('STAFF', 'SUPER_ADMIN'));

// Staff see suppliers; the owner manages them, or staff when allowed (Settings → Permissions).
router.get('/', ctrl.list);
router.post('/', requirePermission('suppliers.edit'), validate(supplierSchema), ctrl.create);
router.patch('/:id', requirePermission('suppliers.edit'), validate(supplierPatchSchema), ctrl.update);
router.put('/:id/ingredients', requirePermission('suppliers.edit'), validate(supplierIngredientsSchema), ctrl.setIngredients);

export default router;
