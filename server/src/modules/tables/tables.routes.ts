import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as ctrl from './tables.controller';
import { layoutSchema, zonePatchSchema, zoneSchema } from './tables.validation';

const router = Router();

router.use(authenticate);

// Staff see the floor plan (live floor view, kitchen); only the owner changes it.
router.get('/floor', requireRole('STAFF', 'SUPER_ADMIN'), ctrl.floor);
router.post('/zones', requireRole('SUPER_ADMIN'), validate(zoneSchema), ctrl.createZone);
router.patch('/zones/:id', requireRole('SUPER_ADMIN'), validate(zonePatchSchema), ctrl.updateZone);
router.delete('/zones/:id', requireRole('SUPER_ADMIN'), ctrl.deleteZone);
router.put('/zones/:id/layout', requireRole('SUPER_ADMIN'), validate(layoutSchema), ctrl.saveLayout);

export default router;
