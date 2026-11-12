// Pure rules for purchase orders (Step 3b). No database here, so they are easy to test.
import { addDays, needsOrder, packsToOrder, type OrderLevels } from '../suppliers/ordering';

export type PoStatus = 'DRAFT' | 'SENT' | 'PARTLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';

/** PO-0001 */
export const formatPoNumber = (n: number) => `PO-${String(n).padStart(4, '0')}`;

/** Lines and note can change only while the order is a draft. */
export const canEdit = (s: PoStatus) => s === 'DRAFT';
/** Nothing has arrived yet: a draft or a sent order can still be cancelled. */
export const canCancel = (s: PoStatus) => s === 'DRAFT' || s === 'SENT';

/** Why a draft cannot be sent, or null when it can. */
export function sendProblem(order: { status: PoStatus; items: { packs: number }[] }): string | null {
  if (order.status !== 'DRAFT') return 'Only a draft can be sent.';
  if (!order.items.some((i) => i.packs > 0)) return 'Tick at least one ingredient before sending.';
  return null;
}

/** Expected delivery: the order day plus the supplier's lead time. */
export const expectedDelivery = (orderDay: string, leadTimeDays: number) => addDays(orderDay, Math.max(0, leadTimeDays));

/**
 * The lines a new order starts with: every active ingredient of the supplier
 * that is at or below its low-stock level, filled up to its target in whole packs.
 */
export function suggestLines<T extends OrderLevels & { id: string; isActive: boolean }>(ingredients: T[]) {
  return ingredients
    .filter((i) => i.isActive && needsOrder(i))
    .map((i) => ({ ingredientId: i.id, packs: packsToOrder(i) }))
    .filter((l) => l.packs > 0);
}
