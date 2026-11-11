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

// Optional Thai text: an empty field clears it (null), so the Thai site shows English.
const optionalThai = (max: number) => z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().trim().max(max).nullable().optional(),
);

const menuItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
  nameTh: optionalThai(200),
  descriptionTh: optionalThai(1000),
  category: z.string().trim().min(1).max(60),
  // Owner-only; ignored for staff. Missing = 0 ("cost missing" for the owner).
  costPrice: z.coerce.number().min(0).max(1_000_000).optional(),
  sellingPrice: z.coerce.number().positive().max(1_000_000),
  isAvailable: formBoolean.optional(),
});

const optionsSchema = z.object({
  groups: z.array(z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(60),
    minSelect: z.number().int().min(0).max(20),
    maxSelect: z.number().int().min(1).max(20),
    modifiers: z.array(z.object({
      id: z.string().uuid().optional(),
      name: z.string().trim().min(1).max(60),
      priceDelta: z.number().min(-100_000).max(100_000),
      isAvailable: z.boolean().default(true),
    })).min(1, 'Each option group needs at least one option').max(30),
  }).refine((g) => g.minSelect <= g.maxSelect, { message: 'Minimum cannot be more than maximum', path: ['minSelect'] })
    .refine((g) => g.minSelect <= g.modifiers.length, { message: 'More choices required than there are options', path: ['minSelect'] }),
  ).max(20),
});

router.get('/categories', ctrl.listCategories);
// optionalAuth: anyone can read the menu; staff/admins sent a token see more
// (hidden items, and cost price for Super Admins).
router.get('/', optionalAuth, ctrl.listItems);
router.get('/:id', optionalAuth, ctrl.getItem);

router.post('/', authenticate, requireRole('STAFF', 'SUPER_ADMIN'), upload.single('image'), validate(menuItemSchema), ctrl.createItem);
router.put('/:id', authenticate, requireRole('STAFF', 'SUPER_ADMIN'), upload.single('image'), validate(menuItemSchema.partial()), ctrl.updateItem);
router.put('/:id/options', authenticate, requireRole('STAFF', 'SUPER_ADMIN'), validate(optionsSchema), ctrl.putOptions);
router.patch('/:id/availability', authenticate, requireRole('STAFF', 'SUPER_ADMIN'), validate(z.object({ isAvailable: z.boolean() })), ctrl.patchAvailability);
router.delete('/:id', authenticate, requireRole('STAFF', 'SUPER_ADMIN'), ctrl.deleteItem);

export default router;
