import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
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
import { authenticate } from './middleware/auth';
import { requireRole } from './middleware/requireRole';
import { profitReportHandler } from './modules/orders/orders.controller';

const app = express();

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
app.use('/uploads', express.static(path.resolve(env.uploadDir)));

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin/staff', staffRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/admin/audit-log', auditLogRoutes);
app.get('/api/admin/reports/profit', authenticate, requireRole('SUPER_ADMIN'), profitReportHandler);

// Error handler (must be last)
app.use(errorHandler);

export default app;
