// Starter layouts, so an owner adjusts a ready plan instead of starting empty.
// Items are placed left to right, top to bottom with a one-cell gap; whatever
// does not fit the zone is left out (the editor says how many were placed).
import type { DecorType, TableShape } from '../../../api/apiSlice';
import {
  DECOR_DEFAULTS, TABLE_DEFAULTS, findFreeSpot, labelKey, newKey, nextLabel,
  type Box, type EditorDecor, type EditorLayout, type EditorTable,
} from './layoutRules';

export type TemplateId = 'FOUR_TOPS' | 'CAFE' | 'FAMILY';
export const TEMPLATES: TemplateId[] = ['FOUR_TOPS', 'CAFE', 'FAMILY'];

interface TableSpec { shape: TableShape; seats?: number }
interface DecorSpec { type: DecorType; x: number | 'center' | 'right'; y: number | 'bottom'; width?: number; height?: number }

const RECIPES: Record<TemplateId, { decor: DecorSpec[]; tables: TableSpec[] }> = {
  FOUR_TOPS: {
    decor: [{ type: 'ENTRANCE', x: 'center', y: 'bottom' }],
    tables: Array.from({ length: 8 }, () => ({ shape: 'SQUARE' as const })),
  },
  CAFE: {
    decor: [
      { type: 'BAR', x: 1, y: 0 },
      { type: 'PLANT', x: 'right', y: 0 },
      { type: 'ENTRANCE', x: 'center', y: 'bottom' },
    ],
    tables: Array.from({ length: 6 }, () => ({ shape: 'ROUND' as const, seats: 2 })),
  },
  FAMILY: {
    decor: [
      { type: 'KITCHEN', x: 'right', y: 0 },
      { type: 'ENTRANCE', x: 1, y: 'bottom' },
    ],
    tables: [
      ...Array.from({ length: 4 }, () => ({ shape: 'SQUARE' as const })),
      ...Array.from({ length: 3 }, () => ({ shape: 'RECT' as const })),
      { shape: 'ROUND' as const, seats: 6 },
    ],
  },
};

/**
 * Build a template for a zone. `usedLabels` are table names in other zones,
 * so new names never clash. Returns the layout and how many tables were wanted.
 */
export function buildTemplate(id: TemplateId, zone: { width: number; height: number }, usedLabels: Set<string>): { layout: EditorLayout; wanted: number } {
  const recipe = RECIPES[id];
  const decor: EditorDecor[] = [];
  for (const d of recipe.decor) {
    const size = DECOR_DEFAULTS[d.type];
    const width = Math.min(d.width ?? size.width, zone.width);
    const height = Math.min(d.height ?? size.height, zone.height);
    const x = d.x === 'center' ? Math.floor((zone.width - width) / 2) : d.x === 'right' ? zone.width - width : d.x;
    const y = d.y === 'bottom' ? zone.height - height : d.y;
    decor.push({ key: newKey('decor'), type: d.type, x, y, width, height, rotation: 0 });
  }

  const taken: Box[] = [...decor];
  const used = new Set(usedLabels);
  const tables: EditorTable[] = [];
  for (const spec of recipe.tables) {
    const size = spec.shape === 'ROUND' && spec.seats && spec.seats > 4
      ? { width: 3, height: 3 } // a bigger round table for 6
      : TABLE_DEFAULTS[spec.shape];
    const spot = findFreeSpot(size, zone, taken);
    if (!spot) continue;
    const label = nextLabel(used);
    used.add(labelKey(label));
    const table: EditorTable = {
      key: newKey('table'), label, shape: spec.shape, seats: spec.seats ?? TABLE_DEFAULTS[spec.shape].seats,
      width: size.width, height: size.height, ...spot, rotation: 0,
    };
    tables.push(table);
    taken.push(table);
  }
  return { layout: { tables, decor }, wanted: recipe.tables.length };
}
