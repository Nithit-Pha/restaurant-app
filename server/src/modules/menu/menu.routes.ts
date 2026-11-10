import { Router } from 'express';
import { z } from 'zod';
import { authenticate, optionalAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { upload } from '../../middleware/upload';
import { validate } from '../../middleware/validate';
import * as ctrl from './menu.controller';

const router = Router();

// Form fields arrive as strings (multipart) or JSON values. z.coerce.boolean()
// would turn the string "false" into true, so parse booleans explicitly.
const formBoolean = z.preprocess(
  (v) => (v === 'true' ? true : v === 'false' ? false : v),
  z.boolean(),
);

const menuItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
  category: z.string().trim().min(1).max(60),
  // Owner-only; ignored for staff. Missing = 0 ("cost missing" for the owner).
  costPrice: z.coerce.number().min(0).max(1_000_000).optional(),
  sellingPrice: z.coerce.number().positive().max(1_000_000),
  isAvailable: formBoolean.optional(),
});

router.get('/categories', ctrl.listCategories);
// optionalAuth: anyone can read the menu; staff/admins sent a token see more
// (hidden items, and cost price for Super Admins).
router.get('/', optionalAuth, ctrl.listItems);
router.get('/:id', optionalAuth, ctrl.getItem);

router.post('/', authenticate, requireRole('STAFF', 'SUPER_ADMIN'), upload.single('image'), validate(menuItemSchema), ctrl.createItem);
router.put('/:id', authenticate, requireRole('STAFF', 'SUPER_ADMIN'), upload.single('image'), validate(menuItemSchema.partial()), ctrl.updateItem);
router.patch('/:id/availability', authenticate, requireRole('STAFF', 'SUPER_ADMIN'), validate(z.object({ isAvailable: z.boolean() })), ctrl.patchAvailability);
router.delete('/:id', authenticate, requireRole('STAFF', 'SUPER_ADMIN'), ctrl.deleteItem);

export default router;
