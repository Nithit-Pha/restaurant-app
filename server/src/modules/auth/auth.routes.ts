import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import * as ctrl from './auth.controller';
import { usernameSchema } from './username';

const router = Router();

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  username: usernameSchema,
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
});

router.post('/register', validate(registerSchema), ctrl.registerHandler);
router.post('/login', validate(loginSchema), ctrl.loginHandler);
router.post('/refresh', ctrl.refreshHandler);
router.get('/me', authenticate, ctrl.meHandler);

export default router;
