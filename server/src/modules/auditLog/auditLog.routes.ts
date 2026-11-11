import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { prisma } from '../../config/db';

const router = Router();

// GET /api/admin/audit-log?actorId=&entityType=&startDate=&endDate=&limit=&offset=
router.get('/', authenticate, requireRole('SUPER_ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { actorId, entityType, startDate, endDate, limit = '50', offset = '0' } = req.query as Record<string, string>;

    const where: Record<string, unknown> = {};
    if (actorId) where.actorId = actorId;
    if (entityType) where.entityType = entityType;
    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate ? { gte: new Date(startDate) } : {}),
        ...(endDate ? { lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)) } : {}),
      };
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, name: true, username: true, email: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        take: Math.min(parseInt(limit), 200),
        skip: parseInt(offset),
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({ total, logs });
  } catch (err) { next(err); }
});

export default router;
