import { Router } from 'express';
import * as controller from './finance.controller';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';

const router = Router();

// All finance routes require an authenticated SUPER_ADMIN.
router.use(authenticate, requireRole('SUPER_ADMIN'));

// Dashboard summary + combined transaction history
router.get('/dashboard', controller.dashboard);

// Expense CRUD
router.get('/expenses', controller.listExpenses);
router.get('/expenses/:id', controller.getExpense);
router.post('/expenses', controller.createExpense);
router.put('/expenses/:id', controller.updateExpense);
router.delete('/expenses/:id', controller.deleteExpense);

export default router;

// Mount in app.ts:
//   import financeRoutes from './modules/finance/finance.routes';
//   app.use('/api/finance', financeRoutes);
