import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import { prisma } from '../../config/db';
import { audit } from '../../utils/auditLog';

const router = Router();

const createStaffSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['STAFF', 'SUPER_ADMIN']),
});

// List all staff/super-admin accounts
router.get('/', authenticate, requireRole('SUPER_ADMIN'), async (_req, res, next) => {
  try {
    const staff = await prisma.user.findMany({
      where: { role: { in: ['STAFF', 'SUPER_ADMIN'] } },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
    res.json(staff);
  } catch (err) { next(err); }
});

// Create a staff or super-admin account
router.post('/', authenticate, requireRole('SUPER_ADMIN'), validate(createStaffSchema), async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) { res.status(409).json({ message: 'Email already registered' }); return; }
    const hash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, password: hash, role },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
    audit({ actorId: req.user!.userId, action: 'CREATE', entityType: 'USER', entityId: user.id, metadata: { name, email, role } });
    res.status(201).json(user);
  } catch (err) { next(err); }
});

// Update role
router.patch('/:id/role', authenticate, requireRole('SUPER_ADMIN'),
  validate(z.object({ role: z.enum(['STAFF', 'SUPER_ADMIN', 'CUSTOMER']) })),
  async (req, res, next) => {
    try {
      const prev = await prisma.user.findUnique({ where: { id: req.params.id }, select: { role: true } });
      const user = await prisma.user.update({
        where: { id: req.params.id },
        data: { role: req.body.role },
        select: { id: true, name: true, email: true, role: true },
      });
      audit({ actorId: req.user!.userId, action: 'UPDATE', entityType: 'USER', entityId: user.id, metadata: { from: prev?.role, to: req.body.role } });
      res.json(user);
    } catch (err) { next(err); }
  }
);

// Deactivate a staff/admin account. Accounts are never hard-deleted: orders,
// status history and the audit log keep pointing at who did what.
// Bumping tokenVersion signs the person out everywhere immediately.
async function setActive(targetId: string, actorId: string, isActive: boolean) {
  const user = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true, email: true, role: true, isActive: true } });
  if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });
  if (user.id === actorId) throw Object.assign(new Error('You cannot deactivate your own account'), { statusCode: 400 });
  const updated = await prisma.user.update({
    where: { id: targetId },
    data: { isActive, ...(isActive ? {} : { tokenVersion: { increment: 1 } }) },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });
  audit({
    actorId,
    action: isActive ? 'REACTIVATE' : 'DEACTIVATE',
    entityType: 'USER',
    entityId: user.id,
    metadata: { email: user.email, role: user.role },
  });
  return updated;
}

router.delete('/:id', authenticate, requireRole('SUPER_ADMIN'), async (req, res, next) => {
  try {
    res.json(await setActive(req.params.id, req.user!.userId, false));
  } catch (err) { next(err); }
});

router.patch('/:id/active', authenticate, requireRole('SUPER_ADMIN'),
  validate(z.object({ isActive: z.boolean() })),
  async (req, res, next) => {
    try {
      res.json(await setActive(req.params.id, req.user!.userId, req.body.isActive));
    } catch (err) { next(err); }
  }
);

export default router;
