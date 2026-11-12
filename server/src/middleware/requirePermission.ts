import { Request, Response, NextFunction } from 'express';
import type { Permission } from '../modules/permissions/permissions.rules';
import { actorCan } from '../modules/permissions/permissions.service';

/**
 * Settings → Permissions (Step 3e): the owner always passes; Staff pass when
 * the owner switched this on. Use after authenticate.
 */
export function requirePermission(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (await actorCan({ role: req.user?.role }, permission)) { next(); return; }
      res.status(403).json({ message: 'The owner has not allowed this for staff (Settings → Permissions).' });
    } catch (err) {
      next(err);
    }
  };
}
