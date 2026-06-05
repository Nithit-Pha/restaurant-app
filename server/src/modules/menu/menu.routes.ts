import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { upload } from '../../middleware/upload';
import { validate } from '../../middleware/validate';
import * as ctrl from './menu.controller';

const router = Router();

const menuItemSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  category: z.string().min(1),
  costPrice: z.coerce.number().positive(),
  sellingPrice: z.coerce.number().positive(),
  isAvailable: z.coerce.boolean().optional(),
});

router.get('/categories', ctrl.listCategories);
router.get('/', ctrl.listItems);
router.get('/:id', ctrl.getItem);

router.post('/', authenticate, requireRole('STAFF', 'SUPER_ADMIN'), upload.single('image'), validate(menuItemSchema), ctrl.createItem);
router.put('/:id', authenticate, requireRole('STAFF', 'SUPER_ADMIN'), upload.single('image'), ctrl.updateItem);
router.patch('/:id/availability', authenticate, requireRole('STAFF', 'SUPER_ADMIN'), validate(z.object({ isAvailable: z.boolean() })), ctrl.patchAvailability);
router.delete('/:id', authenticate, requireRole('STAFF', 'SUPER_ADMIN'), ctrl.deleteItem);

export default router;
