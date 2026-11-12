// What an order does to stock, without the database (unit-tested).
import { Prisma } from '@prisma/client';

type Num = Prisma.Decimal | number | string;

export interface StockLine {
  menuItemId: string;
  quantity: number;
}

export interface RecipeRow {
  menuItemId: string;
  ingredientId: string;
  amount: Num;
}

export interface StockChange {
  ingredientId: string;
  change: Prisma.Decimal;
}

/**
 * One change per ingredient, sorted by id: concurrent orders then lock the
 * ingredient rows in the same order, so two accepts can never deadlock.
 */
function merge(entries: StockChange[]): StockChange[] {
  const total = new Map<string, Prisma.Decimal>();
  for (const e of entries) total.set(e.ingredientId, (total.get(e.ingredientId) ?? new Prisma.Decimal(0)).plus(e.change));
  return [...total.entries()]
    .filter(([, change]) => !change.isZero())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([ingredientId, change]) => ({ ingredientId, change }));
}

/** Stock an accepted order uses: recipe amount × portions, per ingredient (negative). */
export function planSale(lines: StockLine[], recipes: RecipeRow[]): StockChange[] {
  const byItem = new Map<string, RecipeRow[]>();
  for (const r of recipes) byItem.set(r.menuItemId, [...(byItem.get(r.menuItemId) ?? []), r]);
  return merge(lines.flatMap((line) => (byItem.get(line.menuItemId) ?? []).map((r) => ({
    ingredientId: r.ingredientId,
    change: new Prisma.Decimal(r.amount).times(line.quantity).negated(),
  }))));
}

/**
 * Stock a cancelled order gives back: exactly what its SALE movements took,
 * even if the recipe changed in between.
 */
export function planReturn(saleMoves: { ingredientId: string; change: Num }[]): StockChange[] {
  return merge(saleMoves.map((m) => ({ ingredientId: m.ingredientId, change: new Prisma.Decimal(m.change).negated() })));
}

/**
 * Dishes that cannot be made even once: some active ingredient of the recipe
 * has less than one portion's amount in stock. Switched-off ingredients never
 * make a dish sold out.
 */
export function soldOutItems(recipes: (RecipeRow & { ingredient: { quantity: Num; isActive: boolean } })[]): Set<string> {
  const out = new Set<string>();
  for (const r of recipes) {
    if (r.ingredient.isActive && new Prisma.Decimal(r.ingredient.quantity).lt(new Prisma.Decimal(r.amount))) out.add(r.menuItemId);
  }
  return out;
}
