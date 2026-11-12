import { describe, it, expect } from 'vitest';
import { checkLayout, halfExtents, isInside, labelKey, type TableInput } from './layout';

const table = (over: Partial<TableInput> = {}): TableInput => ({
  label: 'T1', shape: 'SQUARE', seats: 4, x: 1, y: 1, width: 2, height: 2, rotation: 0, ...over,
});
const ZONE = { width: 10, height: 8 };

describe('floor plan rules', () => {
  it('turns the outline with the table: 90 degrees swaps width and depth', () => {
    expect(halfExtents({ x: 0, y: 0, width: 4, height: 2, rotation: 0 })).toEqual([2, 1]);
    expect(halfExtents({ x: 0, y: 0, width: 4, height: 2, rotation: 90 })).toEqual([1, 2]);
    const [e45] = halfExtents({ x: 0, y: 0, width: 2, height: 2, rotation: 45 });
    expect(e45).toBeCloseTo(Math.SQRT2); // a 2×2 square turned 45° is √2 from centre to corner
  });

  it('keeps the whole turned table inside the zone', () => {
    expect(isInside({ x: 0, y: 0, width: 10, height: 8, rotation: 0 }, 10, 8)).toBe(true); // exactly the zone
    expect(isInside({ x: 9, y: 0, width: 2, height: 2, rotation: 0 }, 10, 8)).toBe(false); // one cell over the edge
    // A 4×2 table at x=0 fits flat but not stood up on its end near the top edge.
    expect(isInside({ x: 0, y: 0, width: 4, height: 2, rotation: 0 }, 10, 8)).toBe(true);
    expect(isInside({ x: 0, y: 0, width: 4, height: 2, rotation: 90 }, 10, 8)).toBe(false);
    // Turned 45° the corners stick out, so it needs room around it.
    expect(isInside({ x: 0, y: 0, width: 2, height: 2, rotation: 45 }, 10, 8)).toBe(false);
    expect(isInside({ x: 1, y: 1, width: 2, height: 2, rotation: 45 }, 10, 8)).toBe(true);
  });

  it('accepts a tidy layout', () => {
    const tables = [table(), table({ label: 'T2', x: 4 }), table({ label: 'T3', shape: 'RECT', width: 4, height: 2, x: 1, y: 5, seats: 6 })];
    const decor = [{ type: 'BAR' as const, x: 0, y: 7, width: 6, height: 1, rotation: 0 }];
    expect(checkLayout(ZONE, tables, decor)).toEqual([]);
  });

  it('finds tables with the same name, ignoring case and spaces', () => {
    expect(labelKey('  vip   1 ')).toBe('vip 1');
    const problems = checkLayout(ZONE, [table({ label: 'VIP 1' }), table({ label: ' vip  1', x: 5 })], []);
    expect(problems).toEqual([expect.objectContaining({ kind: 'table', index: 1, code: 'LABEL_DUPLICATE' })]);
  });

  it('needs a name, a sensible seat count, and equal sides for round and square tables', () => {
    const problems = checkLayout(ZONE, [
      table({ label: '  ' }),
      table({ label: 'T2', seats: 0, x: 4 }),
      table({ label: 'T3', shape: 'ROUND', width: 3, height: 2, x: 6 }),
    ], []);
    expect(problems.map((p) => [p.index, p.code])).toEqual([[0, 'LABEL_EMPTY'], [1, 'SEATS'], [2, 'NOT_SQUARE']]);
  });

  it('refuses odd angles and items outside the zone, decor included', () => {
    const problems = checkLayout(ZONE, [table({ rotation: 30 }), table({ label: 'T2', x: 9 })], [
      { type: 'WALL', x: 0, y: 7, width: 12, height: 1, rotation: 0 },
    ]);
    expect(problems.map((p) => [p.kind, p.index, p.code])).toEqual([
      ['table', 0, 'ROTATION'],
      ['table', 1, 'OUTSIDE'],
      ['decor', 0, 'OUTSIDE'],
    ]);
  });
});
