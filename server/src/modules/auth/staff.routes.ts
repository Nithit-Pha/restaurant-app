import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import { prisma } from '../../config/db';
import { audit } from '../../utils/auditLog';
import { usernameSchema } from './username';
import { DELETED_USERNAME_PREFIX, deleteStaffAccount } from './staff.service';

const router = Router();

const createStaffSchema = z.object({
  name: z.string().min(2),
  username: usernameSchema,
  // Optional for staff: an empty field counts as "no email".
  email: z.preprocess((v) => (v === '' ? undefined : v), z.string().email().optional()),
  password: z.string().min(8),
  role: z.enum(['STAFF', 'SUPER_ADMIN']),
});

// List all staff/super-admin accounts
router.get('/', authenticate, requireRole('SUPER_ADMIN'), async (_req, res, next) => {
  try {
    const staff = await prisma.user.findMany({
      where: { role: { in: ['STAFF', 'SUPER_ADMIN'] }, NOT: { username: { startsWith: DELETED_USERNAME_PREFIX } } },
      select: { id: true, name: true, username: true, email: true, role: true, isActive: true, createdAt: true },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
    res.json(staff);
  } catch (err) { next(err); }
});

// Create a staff or super-admin account
router.post('/', authenticate, requireRole('SUPER_ADMIN'), validate(createStaffSchema), async (req, res, next) => {
  try {
    const { name, username, email, password, role } = req.body;
    if (await prisma.user.findUnique({ where: { username } })) {
      res.status(409).json({ message: 'Username already taken' }); return;
    }
    if (email && await prisma.user.findUnique({ where: { email } })) {
      res.status(409).json({ message: 'Email already registered' }); return;
    }
    const hash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, username, email, password: hash, role },
      select: { id: true, name: true, username: true, email: true, role: true, createdAt: true },
    });
    audit({ actorId: req.user!.userId, action: 'CREATE', entityType: 'USER', entityId: user.id, metadata: { name, username, email, role } });
    res.status(201).json(user);
  } catch (err) { next(err); }
});

// Update role
router.patch('/:id/role', authenticate, requireRole('SUPER_ADMIN'),
  validate(z.object({ role: z.enum(['STAFF', 'SUPER_ADMIN', 'CUSTOMER']) })),
  async (req, res, next) => {
    try {
      const prev = await prisma.user.findUnique({ where: { id: req.params.id }, select: { role: true, username: true } });
      if (!prev || prev.username.startsWith(DELETED_USERNAME_PREFIX)) { res.status(404).json({ message: 'User not found' }); return; }
      const user = await prisma.user.update({
        where: { id: req.params.id },
        data: { role: req.body.role },
        select: { id: true, name: true, username: true, email: true, role: true },
      });
      audit({ actorId: req.user!.userId, action: 'UPDATE', entityType: 'USER', entityId: user.id, metadata: { from: prev?.role, to: req.body.role } });
      res.json(user);
    } catch (err) { next(err); }
  }
);

// Deactivate a staff/admin account. Orders, status history and the audit log
// keep pointing at who did what (a later delete only wipes personal data).
// Bumping tokenVersion signs the person out everywhere immediately.
async function setActive(targetId: string, actorId: string, isActive: boolean) {
  const user = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true, username: true, role: true, isActive: true } });
  if (!user || user.username.startsWith(DELETED_USERNAME_PREFIX)) throw Object.assign(new Error('User not found'), { statusCode: 404 });
  if (user.id === actorId) throw Object.assign(new Error('You cannot deactivate your own account'), { statusCode: 400 });
  const updated = await prisma.user.update({
    where: { id: targetId },
    data: { isActive, ...(isActive ? {} : { tokenVersion: { increment: 1 } }) },
    select: { id: true, name: true, username: true, email: true, role: true, isActive: true },
  });
  audit({
    actorId,
    action: isActive ? 'REACTIVATE' : 'DEACTIVATE',
    entityType: 'USER',
    entityId: user.id,
    metadata: { username: user.username, role: user.role },
  });
  return updated;
}

// Delete a deactivated account (see deleteStaffAccount: never-used accounts
// are removed, others have their personal data wiped).
router.delete('/:id', authenticate, requireRole('SUPER_ADMIN'), async (req, res, next) => {
  try {
    res.json(await deleteStaffAccount(req.params.id, req.user!.userId));
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
