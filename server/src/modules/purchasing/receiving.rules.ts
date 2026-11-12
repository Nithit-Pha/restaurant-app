// Pure rules for receiving deliveries (Step 3d).
import type { PoStatus } from './purchasing.rules';

type Num = number | string | { toString(): string };
const n = (v: Num) => Number(v.toString());

/** A sent order (or one partly received) can take a delivery. */
export const canReceive = (s: PoStatus) => s === 'SENT' || s === 'PARTLY_RECEIVED';

/** What was ordered on a line, in the ingredient's unit. */
export const orderedAmount = (item: { packs: number; packSize: Num }) => round3(item.packs * n(item.packSize));

/** Still to come on a line (never below 0). */
export const remainingAmount = (item: { packs: number; packSize: Num }, received: Num) =>
  Math.max(0, round3(orderedAmount(item) - n(received)));

export const round3 = (x: number) => Math.round(x * 1000) / 1000;
export const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Status after deliveries: every line in full → RECEIVED; something in →
 * PARTLY_RECEIVED; nothing yet → SENT.
 */
export function statusAfterDeliveries(lines: { ordered: number; received: number }[]): 'SENT' | 'PARTLY_RECEIVED' | 'RECEIVED' {
  if (lines.length && lines.every((l) => l.received >= l.ordered - 1e-9)) return 'RECEIVED';
  return lines.some((l) => l.received > 0) ? 'PARTLY_RECEIVED' : 'SENT';
}

/** Price of one pack from what a line cost (null when nothing came). */
export function packPrice(price: Num, amount: Num, packSize: Num): number | null {
  const packs = n(amount) / (n(packSize) || 1);
  return packs > 0 ? round2(n(price) / packs) : null;
}

/** Text of the one Finance expense of a delivery. */
export const deliveryExpenseText = (poLabel: string, supplier: string, deliveryNo: number) =>
  `${poLabel} ${supplier} (delivery ${deliveryNo})`;
