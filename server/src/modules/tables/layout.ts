// Floor plan rules, kept pure so they are unit-tested in isolation.
// The client has a copy in client/src/features/admin/tables/layoutRules.ts
// for live feedback in the editor - keep the two in step.
//
// Everything is measured in grid cells. A table or decor item is a box
// (x, y, width, height) that may be turned in steps of 45 degrees (0-315) around
// its centre; the whole turned box has to stay inside the zone.

export const ZONE_MIN = 6;
export const ZONE_MAX = 60;
export const TABLE_MAX_SIZE = 8;
export const SEATS_MAX = 30;
export const LABEL_MAX = 12;
/** Every item (table or decor, also future types) turns in 45° steps all the way round. */
export const ROTATION_STEP = 45;
export const ROTATIONS: readonly number[] = Array.from({ length: 360 / ROTATION_STEP }, (_, i) => i * ROTATION_STEP);
export const MAX_ZONES = 10;
export const MAX_TABLES_PER_ZONE = 150;
export const MAX_DECOR_PER_ZONE = 100;

export const TABLE_SHAPES = ['ROUND', 'SQUARE', 'RECT'] as const;
export const DECOR_TYPES = ['WALL', 'BAR', 'ENTRANCE', 'PLANT', 'KITCHEN', 'STAIRS'] as const;

export type TableShape = (typeof TABLE_SHAPES)[number];
export type DecorType = (typeof DECOR_TYPES)[number];

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface TableInput extends Box {
  id?: string;
  label: string;
  shape: TableShape;
  seats: number;
}

export interface DecorInput extends Box {
  type: DecorType;
}

export interface LayoutProblem {
  kind: 'table' | 'decor';
  index: number;
  code: 'OUTSIDE' | 'LABEL_EMPTY' | 'LABEL_DUPLICATE' | 'NOT_SQUARE' | 'SEATS' | 'ROTATION';
  message: string;
}

const EPS = 1e-9;

/**
 * Half the width and height of the box once it is turned (its outline on the
 * grid). Works for any angle, so every item type turns the same way.
 */
export function halfExtents(b: Box): [number, number] {
  const w = b.width / 2;
  const h = b.height / 2;
  const a = (b.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(a));
  const sin = Math.abs(Math.sin(a));
  // Rounded so 90° gives exactly [h, w] instead of 1e-17 leftovers.
  const r = (n: number) => Math.round(n * 1e9) / 1e9;
  return [r(w * cos + h * sin), r(w * sin + h * cos)];
}

/** True when the whole turned box lies inside a zone of zoneWidth × zoneHeight cells. */
export function isInside(b: Box, zoneWidth: number, zoneHeight: number): boolean {
  const [ex, ey] = halfExtents(b);
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  return cx - ex >= -EPS && cy - ey >= -EPS && cx + ex <= zoneWidth + EPS && cy + ey <= zoneHeight + EPS;
}

/** Case- and space-insensitive form of a table label, for "already used" checks. */
export const labelKey = (label: string) => label.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Everything wrong with a zone's layout, in the order found. Empty = OK.
 * Overlapping tables are allowed (the editor warns), so they are not listed.
 */
export function checkLayout(
  zone: { width: number; height: number },
  tables: TableInput[],
  decor: DecorInput[],
): LayoutProblem[] {
  const problems: LayoutProblem[] = [];
  const seen = new Map<string, number>();

  tables.forEach((t, index) => {
    const name = t.label.trim() || `#${index + 1}`;
    if (!ROTATIONS.includes(t.rotation)) {
      problems.push({ kind: 'table', index, code: 'ROTATION', message: `Table ${name} can only be turned in steps of ${ROTATION_STEP} degrees.` });
    }
    if (!t.label.trim()) {
      problems.push({ kind: 'table', index, code: 'LABEL_EMPTY', message: `Table ${index + 1} needs a name.` });
    } else {
      const key = labelKey(t.label);
      if (seen.has(key)) {
        problems.push({ kind: 'table', index, code: 'LABEL_DUPLICATE', message: `Two tables are called ${name}.` });
      } else {
        seen.set(key, index);
      }
    }
    if ((t.shape === 'ROUND' || t.shape === 'SQUARE') && t.width !== t.height) {
      problems.push({ kind: 'table', index, code: 'NOT_SQUARE', message: `Table ${name}: round and square tables need the same width and depth.` });
    }
    if (!Number.isInteger(t.seats) || t.seats < 1 || t.seats > SEATS_MAX) {
      problems.push({ kind: 'table', index, code: 'SEATS', message: `Table ${name} needs 1 to ${SEATS_MAX} seats.` });
    }
    if (!isInside(t, zone.width, zone.height)) {
      problems.push({ kind: 'table', index, code: 'OUTSIDE', message: `Table ${name} is outside the zone.` });
    }
  });

  decor.forEach((d, index) => {
    if (!ROTATIONS.includes(d.rotation)) {
      problems.push({ kind: 'decor', index, code: 'ROTATION', message: `A ${d.type.toLowerCase()} can only be turned in steps of ${ROTATION_STEP} degrees.` });
    }
    if (!isInside(d, zone.width, zone.height)) {
      problems.push({ kind: 'decor', index, code: 'OUTSIDE', message: `A ${d.type.toLowerCase()} is outside the zone.` });
    }
  });

  return problems;
}
