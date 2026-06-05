import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import { prisma } from '../../config/db';

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
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
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
    res.status(201).json(user);
  } catch (err) { next(err); }
});

// Update role
router.patch('/:id/role', authenticate, requireRole('SUPER_ADMIN'),
  validate(z.object({ role: z.enum(['STAFF', 'SUPER_ADMIN', 'CUSTOMER']) })),
  async (req, res, next) => {
    try {
      const user = await prisma.user.update({
        where: { id: req.params.id },
        data: { role: req.body.role },
        select: { id: true, name: true, email: true, role: true },
      });
      res.json(user);
    } catch (err) { next(err); }
  }
);

export default router;
