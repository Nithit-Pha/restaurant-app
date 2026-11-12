import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './modules/auth/auth.routes';
import staffRoutes from './modules/auth/staff.routes';
import menuRoutes from './modules/menu/menu.routes';
import ordersRoutes from './modules/orders/orders.routes';
import settingsRoutes from './modules/settings/settings.routes';
import financeRoutes from './modules/finance/finance.routes';
import auditLogRoutes from './modules/auditLog/auditLog.routes';
import addressesRoutes from './modules/addresses/addresses.routes';
import tablesRoutes from './modules/tables/tables.routes';
import dineInRoutes from './modules/dineIn/dineIn.routes';
import { authenticate } from './middleware/auth';
import { requireRole } from './middleware/requireRole';
import { profitReportHandler } from './modules/orders/orders.controller';

const app = express();

// The Next.js rewrite proxies /api from the same machine; trust it so
// req.ip is the visitor's address (rate limiting depends on it).
app.set('trust proxy', 'loopback');

// Security headers. Uploaded images are shown on the website's origin.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS
app.use(cors({ origin: env.clientUrl, credentials: true }));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
if (env.nodeEnv !== 'test') {
  app.use(morgan(env.nodeEnv === 'development' ? 'dev' : 'combined'));
}

// Static uploads
// nosniff: the browser must trust the Content-Type and never guess that a
// file is a web page. Only image files are served from here.
app.use('/uploads', express.static(path.resolve(env.uploadDir), {
  setHeaders: (res, filePath) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!/\.(jpe?g|png|gif|webp)$/i.test(filePath)) {
      res.setHeader('Content-Disposition', 'attachment');
    }
  },
}));

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Brute-force protection on sign-in. Login is limited per address + username,
// so one busy office network does not lock everyone out.
const limiterOptions = { standardHeaders: true, legacyHeaders: false, message: { message: 'Too many attempts. Please wait a few minutes and try again.' } } as const;
app.use('/api/auth/login', rateLimit({
  ...limiterOptions,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => `${req.ip}|${String(req.body?.username ?? '').trim().toLowerCase()}`,
}));
app.use('/api/auth/register', rateLimit({ ...limiterOptions, windowMs: 60 * 60 * 1000, limit: 20 }));
app.use('/api/auth/refresh', rateLimit({ ...limiterOptions, windowMs: 15 * 60 * 1000, limit: 120 }));
// Dine-in guests need no account: keep their endpoints from being hammered.
app.use(['/api/dine-in/t', '/api/dine-in/visit'], rateLimit({ ...limiterOptions, windowMs: 60 * 1000, limit: 300 }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin/staff', staffRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/admin/audit-log', auditLogRoutes);
app.use('/api/addresses', addressesRoutes);
app.use('/api/tables', tablesRoutes);
app.use('/api/dine-in', dineInRoutes);
app.get('/api/admin/reports/profit', authenticate, requireRole('SUPER_ADMIN'), profitReportHandler);

// Error handler (must be last)
app.use(errorHandler);

export default app;
