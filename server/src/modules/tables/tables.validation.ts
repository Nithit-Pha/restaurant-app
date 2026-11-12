import { z } from 'zod';
import {
  DECOR_TYPES, LABEL_MAX, MAX_DECOR_PER_ZONE, MAX_TABLES_PER_ZONE, ROTATIONS, SEATS_MAX, TABLE_MAX_SIZE, TABLE_SHAPES,
  ZONE_MAX, ZONE_MIN,
} from './layout';

// x / y are the top-left corner *before* the item is turned, so a long table
// turned 90 degrees against a wall has a corner outside the zone (e.g. x = -1)
// while the table itself is inside. Only rough limits here: whether the turned
// item really fits is checked by checkLayout() in the service.
const position = z.number().int().min(-ZONE_MAX).max(ZONE_MAX);
const rotation = z.number().int().refine((r) => ROTATIONS.includes(r), 'Turn in steps of 45 degrees (0 to 315)');

export const zoneSchema = z.object({
  name: z.string().trim().min(1, 'Give the zone a name, e.g. Indoor').max(40),
  width: z.number().int().min(ZONE_MIN).max(ZONE_MAX),
  height: z.number().int().min(ZONE_MIN).max(ZONE_MAX),
});

export const zonePatchSchema = zoneSchema.partial().refine((d) => Object.keys(d).length > 0, 'Nothing to change');

export const tableSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1, 'Every table needs a name').max(LABEL_MAX),
  shape: z.enum(TABLE_SHAPES),
  seats: z.number().int().min(1).max(SEATS_MAX),
  x: position,
  y: position,
  width: z.number().int().min(1).max(TABLE_MAX_SIZE),
  height: z.number().int().min(1).max(TABLE_MAX_SIZE),
  rotation,
});

export const decorSchema = z.object({
  type: z.enum(DECOR_TYPES),
  x: position,
  y: position,
  width: z.number().int().min(1).max(ZONE_MAX),
  height: z.number().int().min(1).max(ZONE_MAX),
  rotation,
});

export const layoutSchema = z.object({
  tables: z.array(tableSchema).max(MAX_TABLES_PER_ZONE),
  decor: z.array(decorSchema).max(MAX_DECOR_PER_ZONE).default([]),
});
