// Stock rules that need no database, so they are unit-tested on their own.
import { Prisma } from '@prisma/client';

/** Units an ingredient can be kept in. Recipes (Step 2b) use the same unit. */
export const UNITS = ['kg', 'g', 'L', 'ml', 'pcs', 'pack'] as const;
export type Unit = (typeof UNITS)[number];

/** Largest amount accepted in one change or count (keeps typos like 50000 kg out). */
export const MAX_AMOUNT = 100_000;

type Num = Prisma.Decimal | number | string;
const dec = (v: Num) => new Prisma.Decimal(v);

/** "Low stock": an active ingredient at or below its reorder level. */
export function isLow(ing: { quantity: Num; reorderLevel: Num; isActive: boolean }): boolean {
  return ing.isActive && dec(ing.quantity).lte(dec(ing.reorderLevel));
}

/** The change a count makes: counted minus what the app had (can be 0 or negative). */
export function countChange(current: Num, counted: Num): Prisma.Decimal {
  return dec(counted).minus(dec(current));
}

/** Text for the Finance expense a priced stock in creates, e.g. "Stock in: 2.5 kg Pork belly". */
export function stockInExpenseText(amount: Num, unit: string, name: string, note?: string): string {
  const base = `Stock in: ${dec(amount).toString()} ${unit} ${name}`;
  return note?.trim() ? `${base} (${note.trim()})` : base;
}
