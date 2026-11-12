import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import { requirePermission } from '../../middleware/requirePermission';
import * as ctrl from './stock.controller';
import { countSchema, ingredientPatchSchema, ingredientSchema, recipeSchema, stockInSchema, wasteSchema } from './stock.validation';

const router = Router();

router.use(authenticate, requireRole('STAFF', 'SUPER_ADMIN'));

// Staff and owner see stock and record what happens to it.
router.get('/ingredients', ctrl.list);
router.get('/movements', ctrl.movements);
// Staff: as allowed on Settings → Permissions (on by default). Price: see the service.
router.post('/ingredients/:id/in', requirePermission('stock.moves'), validate(stockInSchema), ctrl.stockIn);
router.post('/ingredients/:id/count', requirePermission('stock.moves'), validate(countSchema), ctrl.count);
router.post('/ingredients/:id/waste', requirePermission('stock.moves'), validate(wasteSchema), ctrl.waste);
// Adding and changing ingredients (levels, pack, supplier): owner, or staff when allowed.
router.post('/ingredients', requirePermission('suppliers.edit'), validate(ingredientSchema), ctrl.create);
router.patch('/ingredients/:id', requirePermission('suppliers.edit'), validate(ingredientPatchSchema), ctrl.update);
// Recipes: staff may look, only the owner changes them.
router.get('/recipes/:menuItemId', ctrl.recipe);
router.put('/recipes/:menuItemId', requireRole('SUPER_ADMIN'), validate(recipeSchema), ctrl.saveRecipe);

export default router;
