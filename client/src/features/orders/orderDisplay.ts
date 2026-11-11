import type { Order, OrderStatus } from '../../api/apiSlice';
import { TIME_ZONE } from '../../lib/format';

// Words for statuses, actions and payments are in useOrderLabels.ts (translated).

/** "#042" for the daily order number; falls back to the id for older orders. */
export function formatOrderNumber(order: Pick<Order, 'id' | 'orderNumber'>): string {
  return order.orderNumber != null ? `#${String(order.orderNumber).padStart(3, '0')}` : `#${order.id.slice(0, 8)}`;
}

/**
 * The forward step staff can take next (mirrors the server's state machine in
 * server/src/modules/orders/orderStateMachine.ts — the server has the final say).
 */
export function nextForwardStatus(order: Pick<Order, 'status' | 'type'>): OrderStatus | null {
  switch (order.status) {
    case 'PENDING': return 'PREPARING';
    case 'PREPARING': return 'READY';
    case 'READY': return order.type === 'DELIVERY' ? 'OUT_FOR_DELIVERY' : 'DELIVERED';
    case 'OUT_FOR_DELIVERY': return 'DELIVERED';
    default: return null;
  }
}

export const isFinal = (status: OrderStatus) => status === 'DELIVERED' || status === 'CANCELLED';

/** "14:35" in Bangkok time (24-hour, the same in both languages). */
export function formatClock(iso?: string | null): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE }).format(new Date(iso));
}
