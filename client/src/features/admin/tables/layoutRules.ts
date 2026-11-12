// Floor plan rules for live feedback in the editor. The server checks the same
// rules again on save: server/src/modules/tables/layout.ts - keep the two in step.
import type { DecorItem, DecorType, TableShape } from '../../../api/apiSlice';

export const ZONE_MIN = 6;
export const ZONE_MAX = 60;
export const TABLE_MAX_SIZE = 8;
export const SEATS_MAX = 30;
export const LABEL_MAX = 12;
/** Every item (table or decor, also future types) turns in 45° steps all the way round. */
export const ROTATION_STEP = 45;
export const ROTATIONS: readonly number[] = Array.from({ length: 360 / ROTATION_STEP }, (_, i) => i * ROTATION_STEP);
export const MAX_TABLES_PER_ZONE = 150;
export const MAX_DECOR_PER_ZONE = 100;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

/** A table while it is being edited. `key` is the id, or a temporary one for new tables. */
export interface EditorTable extends Box {
  key: string;
  id?: string;
  label: string;
  shape: TableShape;
  seats: number;
}

export interface EditorDecor extends DecorItem {
  key: string;
}

export interface EditorLayout {
  tables: EditorTable[];
  decor: EditorDecor[];
}

export type ProblemCode = 'OUTSIDE' | 'LABEL_EMPTY' | 'LABEL_DUPLICATE' | 'LABEL_TAKEN' | 'NOT_SQUARE' | 'SEATS';

export interface Problem {
  kind: 'table' | 'decor';
  key: string;
  code: ProblemCode;
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

export function isInside(b: Box, zoneWidth: number, zoneHeight: number) {
  const [ex, ey] = halfExtents(b);
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  return cx - ex >= -EPS && cy - ey >= -EPS && cx + ex <= zoneWidth + EPS && cy + ey <= zoneHeight + EPS;
}

/** The turned box's outline as left, top, right, bottom (grid cells). */
export function outline(b: Box): [number, number, number, number] {
  const [ex, ey] = halfExtents(b);
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  return [cx - ex, cy - ey, cx + ex, cy + ey];
}

/** Nearest whole-cell position that keeps the turned box inside the zone. */
export function clampInside<T extends Box>(b: T, zoneWidth: number, zoneHeight: number): T {
  const [ex, ey] = halfExtents(b);
  const minX = Math.ceil(ex - b.width / 2 - EPS);
  const minY = Math.ceil(ey - b.height / 2 - EPS);
  const maxX = Math.floor(zoneWidth - ex - b.width / 2 + EPS);
  const maxY = Math.floor(zoneHeight - ey - b.height / 2 + EPS);
  return {
    ...b,
    x: Math.min(Math.max(b.x, minX), Math.max(minX, maxX)),
    y: Math.min(Math.max(b.y, minY), Math.max(minY, maxY)),
  };
}

export const labelKey = (label: string) => label.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Problems that block saving. `takenLabels` are names used in other zones
 * (labels are unique across the restaurant).
 */
export function findProblems(layout: EditorLayout, zone: { width: number; height: number }, takenLabels: Set<string>): Problem[] {
  const problems: Problem[] = [];
  const seen = new Set<string>();
  for (const t of layout.tables) {
    const key = labelKey(t.label);
    if (!key) problems.push({ kind: 'table', key: t.key, code: 'LABEL_EMPTY' });
    else if (takenLabels.has(key)) problems.push({ kind: 'table', key: t.key, code: 'LABEL_TAKEN' });
    else if (seen.has(key)) problems.push({ kind: 'table', key: t.key, code: 'LABEL_DUPLICATE' });
    seen.add(key);
    if ((t.shape === 'ROUND' || t.shape === 'SQUARE') && t.width !== t.height) problems.push({ kind: 'table', key: t.key, code: 'NOT_SQUARE' });
    if (!Number.isInteger(t.seats) || t.seats < 1 || t.seats > SEATS_MAX) problems.push({ kind: 'table', key: t.key, code: 'SEATS' });
    if (!isInside(t, zone.width, zone.height)) problems.push({ kind: 'table', key: t.key, code: 'OUTSIDE' });
  }
  for (const d of layout.decor) {
    if (!isInside(d, zone.width, zone.height)) problems.push({ kind: 'decor', key: d.key, code: 'OUTSIDE' });
  }
  return problems;
}

const overlaps = (a: Box, b: Box) => {
  const [al, at, ar, ab] = outline(a);
  const [bl, bt, br, bb] = outline(b);
  return al < br - EPS && bl < ar - EPS && at < bb - EPS && bt < ab - EPS;
};

/** Pairs of tables whose outlines overlap: a warning only, saving is still allowed. */
export function overlappingTables(tables: EditorTable[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (let i = 0; i < tables.length; i++) {
    for (let j = i + 1; j < tables.length; j++) {
      if (overlaps(tables[i], tables[j])) {
        result.set(tables[i].key, [...(result.get(tables[i].key) ?? []), tables[j].label]);
        result.set(tables[j].key, [...(result.get(tables[j].key) ?? []), tables[i].label]);
      }
    }
  }
  return result;
}

/** "T1", "T2", ... the first number not used anywhere in the restaurant. */
export function nextLabel(used: Set<string>, prefix = 'T'): string {
  for (let n = 1; ; n++) {
    const label = `${prefix}${n}`;
    if (!used.has(labelKey(label))) return label;
  }
}

/** First free spot (left to right, top to bottom, one cell gap) for a box of this size, or null. */
export function findFreeSpot(size: { width: number; height: number }, zone: { width: number; height: number }, taken: Box[]): { x: number; y: number } | null {
  for (let y = 1; y + size.height <= zone.height; y++) {
    for (let x = 1; x + size.width <= zone.width; x++) {
      const box = { x: x - 0.5, y: y - 0.5, width: size.width + 1, height: size.height + 1, rotation: 0 }; // keep a gap
      if (!taken.some((t) => overlaps(box, t))) return { x, y };
    }
  }
  return null;
}

/** Turn by 45 degrees: 0 → 45 → 90 → 135 → 0. */
/** Turn by 45 degrees: 0 → 45 → … → 315 → 0. */
export const nextRotation = (r: number) => ROTATIONS[(ROTATIONS.indexOf(r) + 1) % ROTATIONS.length];

export const TABLE_DEFAULTS: Record<TableShape, { width: number; height: number; seats: number }> = {
  ROUND: { width: 2, height: 2, seats: 4 },
  SQUARE: { width: 2, height: 2, seats: 4 },
  RECT: { width: 4, height: 2, seats: 6 },
};

export const DECOR_DEFAULTS: Record<DecorType, { width: number; height: number }> = {
  WALL: { width: 6, height: 1 },
  BAR: { width: 6, height: 2 },
  ENTRANCE: { width: 3, height: 1 },
  PLANT: { width: 1, height: 1 },
  KITCHEN: { width: 4, height: 3 },
  STAIRS: { width: 2, height: 3 },
};

let tempId = 0;
export const newKey = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(tempId++).toString(36)}`;
