import { Router, type NextFunction, type Request, type Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { alertsFor } from './alerts.service';

const router = Router();

// The alert bell (Step 3f) for staff and owner.
router.get('/', authenticate, requireRole('STAFF', 'SUPER_ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await alertsFor(req.user!.role)); } catch (err) { next(err); }
});

export default router;
