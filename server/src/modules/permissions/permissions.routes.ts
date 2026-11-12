import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import { PERMISSION_KEYS, permissionsFor, type Permission } from './permissions.rules';
import { getStaffPermissions, setStaffPermissions } from './permissions.service';

const router = Router();
router.use(authenticate, requireRole('STAFF', 'SUPER_ADMIN'));

// Staff and owner: the staff settings, and what *I* may do (to show the right buttons).
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const staff = await getStaffPermissions();
    res.json({ staff, mine: permissionsFor(req.user!.role, staff) });
  } catch (err) { next(err); }
});

const patchSchema = z.object(Object.fromEntries(PERMISSION_KEYS.map((k) => [k, z.boolean().optional()])) as Record<Permission, z.ZodOptional<z.ZodBoolean>>)
  .refine((d) => Object.values(d).some((v) => v !== undefined), 'Nothing to change');

router.put('/', requireRole('SUPER_ADMIN'), validate(patchSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const staff = await setStaffPermissions(req.body, req.user!.userId);
    res.json({ staff, mine: permissionsFor(req.user!.role, staff) });
  } catch (err) { next(err); }
});

export default router;
