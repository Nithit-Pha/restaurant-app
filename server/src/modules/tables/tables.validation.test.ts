import { describe, it, expect, vi } from 'vitest';

vi.mock('../../config/db', () => ({ prisma: {} }));

import { layoutSchema } from './tables.validation';
import { checkLayout } from './layout';

const ZONE = { width: 12, height: 10 };
// A long table turned 90 degrees, pushed against the left and top walls: its
// unturned corner is at (-1, 1) but the turned table spans x 0..2, y 0..4.
const turnedLong = { label: 'T1', shape: 'RECT' as const, seats: 6, x: -1, y: 1, width: 4, height: 2, rotation: 90 };

describe('layout input', () => {
  it('accepts a turned table whose unturned corner is outside the zone', () => {
    const parsed = layoutSchema.safeParse({ tables: [turnedLong], decor: [] });
    expect(parsed.success).toBe(true);
    expect(checkLayout(ZONE, parsed.data!.tables, parsed.data!.decor)).toEqual([]);
  });

  it('accepts a turned wall against the edge too', () => {
    const wall = { type: 'WALL', x: -2, y: 3, width: 6, height: 1, rotation: 90 }; // spans x 0.5..1.5, y 0.5..6.5
    const parsed = layoutSchema.safeParse({ tables: [], decor: [wall] });
    expect(parsed.success).toBe(true);
    expect(checkLayout(ZONE, [], parsed.data!.decor)).toEqual([]);
  });

  it('still refuses a table that really sticks out, with a clear message', () => {
    const parsed = layoutSchema.safeParse({ tables: [{ ...turnedLong, x: -2 }], decor: [] });
    expect(parsed.success).toBe(true); // the rough limits pass…
    expect(checkLayout(ZONE, parsed.data!.tables, [])).toEqual([
      expect.objectContaining({ code: 'OUTSIDE', message: 'Table T1 is outside the zone.' }), // …the real check refuses it
    ]);
  });

  it('refuses positions far outside any zone and odd angles', () => {
    expect(layoutSchema.safeParse({ tables: [{ ...turnedLong, x: -61 }] }).success).toBe(false);
    expect(layoutSchema.safeParse({ tables: [{ ...turnedLong, rotation: 30 }] }).success).toBe(false);
  });
});
