import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as ctrl from './stock.controller';
import { countSchema, ingredientPatchSchema, ingredientSchema, stockInSchema, wasteSchema } from './stock.validation';

const router = Router();

router.use(authenticate, requireRole('STAFF', 'SUPER_ADMIN'));

// Staff and owner see stock and record what happens to it.
router.get('/ingredients', ctrl.list);
router.get('/movements', ctrl.movements);
router.post('/ingredients/:id/in', validate(stockInSchema), ctrl.stockIn); // price: owner only (service)
router.post('/ingredients/:id/count', validate(countSchema), ctrl.count);
router.post('/ingredients/:id/waste', validate(wasteSchema), ctrl.waste);
// Only the owner adds ingredients or changes them.
router.post('/ingredients', requireRole('SUPER_ADMIN'), validate(ingredientSchema), ctrl.create);
router.patch('/ingredients/:id', requireRole('SUPER_ADMIN'), validate(ingredientPatchSchema), ctrl.update);

export default router;
