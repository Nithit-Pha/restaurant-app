import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as ctrl from './tables.controller';
import {
  DECOR_TYPES, LABEL_MAX, MAX_DECOR_PER_ZONE, MAX_TABLES_PER_ZONE, ROTATIONS, SEATS_MAX, TABLE_MAX_SIZE, TABLE_SHAPES,
  ZONE_MAX, ZONE_MIN,
} from './layout';

const router = Router();

const cell = z.number().int().min(0).max(ZONE_MAX);
const rotation = z.number().int().refine((r) => (ROTATIONS as readonly number[]).includes(r), 'Turn by 0, 45, 90 or 135 degrees');

const zoneSchema = z.object({
  name: z.string().trim().min(1, 'Give the zone a name, e.g. Indoor').max(40),
  width: z.number().int().min(ZONE_MIN).max(ZONE_MAX),
  height: z.number().int().min(ZONE_MIN).max(ZONE_MAX),
});
const zonePatchSchema = zoneSchema.partial().refine((d) => Object.keys(d).length > 0, 'Nothing to change');

const tableSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1, 'Every table needs a name').max(LABEL_MAX),
  shape: z.enum(TABLE_SHAPES),
  seats: z.number().int().min(1).max(SEATS_MAX),
  x: cell,
  y: cell,
  width: z.number().int().min(1).max(TABLE_MAX_SIZE),
  height: z.number().int().min(1).max(TABLE_MAX_SIZE),
  rotation,
});

const decorSchema = z.object({
  type: z.enum(DECOR_TYPES),
  x: cell,
  y: cell,
  width: z.number().int().min(1).max(ZONE_MAX),
  height: z.number().int().min(1).max(ZONE_MAX),
  rotation,
});

const layoutSchema = z.object({
  tables: z.array(tableSchema).max(MAX_TABLES_PER_ZONE),
  decor: z.array(decorSchema).max(MAX_DECOR_PER_ZONE).default([]),
});

router.use(authenticate);

// Staff see the floor plan (live floor view, kitchen); only the owner changes it.
router.get('/floor', requireRole('STAFF', 'SUPER_ADMIN'), ctrl.floor);
router.post('/zones', requireRole('SUPER_ADMIN'), validate(zoneSchema), ctrl.createZone);
router.patch('/zones/:id', requireRole('SUPER_ADMIN'), validate(zonePatchSchema), ctrl.updateZone);
router.delete('/zones/:id', requireRole('SUPER_ADMIN'), ctrl.deleteZone);
router.put('/zones/:id/layout', requireRole('SUPER_ADMIN'), validate(layoutSchema), ctrl.saveLayout);

export default router;
