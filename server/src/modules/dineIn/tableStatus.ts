import type { Prisma } from '@prisma/client';

export type TableStatus = 'FREE' | 'SEATED' | 'ORDERED' | 'SERVED' | 'BILL_REQUESTED' | 'CLEANING';

interface VisitSnapshot {
  billRequestedAt: Date | null;
  closedAt: Date | null;
}

/**
 * A table's status during an open visit, from the visit and its orders.
 * Pure, so it is unit-tested. (After payment the table is set to CLEANING,
 * and staff set it FREE when it is ready again.)
 *
 *   bill requested                         → BILL_REQUESTED
 *   some order still waiting / cooking     → ORDERED
 *   every (not cancelled) order served     → SERVED
 *   no orders yet                          → SEATED
 */
export function tableStatusFor(visit: VisitSnapshot, orderStatuses: string[]): TableStatus {
  if (visit.closedAt) return 'CLEANING';
  if (visit.billRequestedAt) return 'BILL_REQUESTED';
  const live = orderStatuses.filter((s) => s !== 'CANCELLED');
  if (live.length === 0) return 'SEATED';
  return live.every((s) => s === 'DELIVERED') ? 'SERVED' : 'ORDERED';
}

/** Recalculate and store the status of the visit's table. Returns the new status, or null without a table. */
export async function syncTableStatus(tx: Prisma.TransactionClient, sessionId: string): Promise<TableStatus | null> {
  const visit = await tx.tableSession.findUnique({
    where: { id: sessionId },
    select: { tableId: true, billRequestedAt: true, closedAt: true, orders: { select: { status: true } } },
  });
  if (!visit?.tableId) return null;
  const status = tableStatusFor(visit, visit.orders.map((o) => o.status));
  await tx.diningTable.update({ where: { id: visit.tableId }, data: { status } });
  return status;
}
