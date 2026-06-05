import { Request, Response, NextFunction } from 'express';

// Role hierarchy: CUSTOMER < STAFF < SUPER_ADMIN
const ROLE_RANK: Record<string, number> = {
  CUSTOMER: 0,
  STAFF: 1,
  SUPER_ADMIN: 2,
};

/**
 * requireRole('STAFF', 'SUPER_ADMIN') — passes if req.user.role is any of the listed roles.
 * requireRole('SUPER_ADMIN') — Super Admin only.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userRole = req.user?.role;
    if (!userRole || !roles.includes(userRole)) {
      res.status(403).json({ message: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

/** True if userRole is at least as high as minRole in the hierarchy */
export function hasMinRole(userRole: string, minRole: string): boolean {
  return (ROLE_RANK[userRole] ?? -1) >= (ROLE_RANK[minRole] ?? 999);
}
