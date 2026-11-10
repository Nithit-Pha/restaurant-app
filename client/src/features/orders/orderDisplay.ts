import type { CancelReason, Order, OrderStatus } from '../../api/apiSlice';

/** "#042" for the daily order number; falls back to the id for older orders. */
export function formatOrderNumber(order: Pick<Order, 'id' | 'orderNumber'>): string {
  return order.orderNumber != null ? `#${String(order.orderNumber).padStart(3, '0')}` : `#${order.id.slice(0, 8)}`;
}

/** Status words as customers and staff see them. DELIVERED reads "Completed" for pickup. */
export function statusLabel(status: OrderStatus, type?: Order['type']): string {
  switch (status) {
    case 'PENDING': return 'Waiting for the restaurant';
    case 'PREPARING': return 'Preparing';
    case 'READY': return type === 'DELIVERY' ? 'Ready, waiting for rider' : 'Ready for pickup';
    case 'OUT_FOR_DELIVERY': return 'Out for delivery';
    case 'DELIVERED': return type === 'PICKUP' ? 'Completed' : 'Delivered';
    case 'CANCELLED': return 'Cancelled';
    default: return status;
  }
}

/** Short labels for the staff screens. */
export function shortStatusLabel(status: OrderStatus, type?: Order['type']): string {
  if (status === 'PENDING') return 'New';
  if (status === 'READY') return 'Ready';
  return statusLabel(status, type);
}

export const CANCEL_REASON_LABELS: Record<CancelReason, string> = {
  SOLD_OUT: 'Item sold out',
  CLOSING_SOON: 'Closing soon',
  TOO_BUSY: 'Kitchen too busy',
  OUT_OF_AREA: 'Address outside delivery area',
  CUSTOMER_REQUEST: 'Customer asked to cancel',
  OTHER: 'Other',
};

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

export function forwardActionLabel(order: Pick<Order, 'status' | 'type'>): string {
  switch (order.status) {
    case 'PENDING': return 'Accept';
    case 'PREPARING': return 'Mark ready';
    case 'READY': return order.type === 'DELIVERY' ? 'Out for delivery' : 'Picked up';
    case 'OUT_FOR_DELIVERY': return 'Delivered';
    default: return '';
  }
}

export const isFinal = (status: OrderStatus) => status === 'DELIVERED' || status === 'CANCELLED';

/** "14:35" in the viewer's locale. */
export function formatClock(iso?: string | null): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}
