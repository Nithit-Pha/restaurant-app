import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import { masked } from './notifications.rules';
import { channelStatus, getNotificationSettings, sendTest, setNotificationSettings } from './notifications.service';

const router = Router();
router.use(authenticate, requireRole('SUPER_ADMIN'));

const view = async () => ({ settings: masked(await getNotificationSettings()), status: channelStatus() });

// Owner: settings (secrets hidden) and the last result of each channel.
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try { res.json(await view()); } catch (err) { next(err); }
});

const text = (max: number) => z.string().trim().max(max);
const patchSchema = z.object({
  web: z.boolean().optional(),
  language: z.enum(['th', 'en']).optional(),
  events: z.object({ urgentStock: z.boolean(), newDrafts: z.boolean(), deliveriesDue: z.boolean() }).partial().optional(),
  line: z.object({ enabled: z.boolean(), token: text(500), to: text(100) }).partial().optional(),
  email: z.object({
    enabled: z.boolean(),
    host: text(200),
    port: z.number().int().min(1).max(65535),
    user: text(200),
    pass: z.string().max(200),
    from: text(200),
    to: text(1000),
  }).partial().optional(),
});

router.put('/', validate(patchSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await setNotificationSettings(req.body, req.user!.userId);
    res.json(await view());
  } catch (err) { next(err); }
});

router.post('/test', validate(z.object({ channel: z.enum(['line', 'email']) })), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await sendTest(req.body.channel);
    res.json(await view());
  } catch (err) { next(err); }
});

export default router;
