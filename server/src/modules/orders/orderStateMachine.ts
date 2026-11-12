// The order workflow: which status may follow which. Pure, so it is
// unit-tested in isolation; every status change in the app goes through it.
//
//   PENDING → PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED   (delivery)
//   PENDING → PREPARING → READY → DELIVERED                      (pickup)
//   PENDING → PREPARING → READY → DELIVERED                      (dine-in: "Served")
//   any non-final status → CANCELLED (with a reason)
//
// DELIVERED is the final "completed" status for both types; the UI calls it
// "Completed" for pickup orders.

export type OrderStatus = 'PENDING' | 'PREPARING' | 'READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';
export type OrderType = 'PICKUP' | 'DELIVERY' | 'DINE_IN';
export type CancelReason = 'SOLD_OUT' | 'CLOSING_SOON' | 'TOO_BUSY' | 'OUT_OF_AREA' | 'CUSTOMER_REQUEST' | 'OTHER';

export const CANCEL_REASONS: CancelReason[] = ['SOLD_OUT', 'CLOSING_SOON', 'TOO_BUSY', 'OUT_OF_AREA', 'CUSTOMER_REQUEST', 'OTHER'];
export const FINAL_STATUSES: OrderStatus[] = ['DELIVERED', 'CANCELLED'];

/** Statuses an order may move to next. */
export function allowedNext(from: OrderStatus, type: OrderType): OrderStatus[] {
  switch (from) {
    case 'PENDING':
      return ['PREPARING', 'CANCELLED'];
    case 'PREPARING':
      return ['READY', 'CANCELLED'];
    case 'READY':
      return type === 'DELIVERY' ? ['OUT_FOR_DELIVERY', 'CANCELLED'] : ['DELIVERED', 'CANCELLED'];
    case 'OUT_FOR_DELIVERY':
      return ['DELIVERED', 'CANCELLED'];
    default:
      return []; // DELIVERED and CANCELLED are final
  }
}

export interface TransitionInput {
  to: OrderStatus;
  prepMinutes?: number;
  cancelReason?: CancelReason;
  cancelNote?: string;
  actorId?: string;
}

const conflict = (message: string) => Object.assign(new Error(message), { statusCode: 409 });
const badRequest = (message: string) => Object.assign(new Error(message), { statusCode: 400 });

/**
 * Check a move and return the Order fields to write with it.
 * Throws 409 for a move the workflow does not allow, 400 for missing details.
 */
export function planTransition(
  order: { status: OrderStatus; type: OrderType },
  input: TransitionInput,
  now: Date = new Date(),
): Record<string, unknown> {
  const { to } = input;
  if (!allowedNext(order.status, order.type).includes(to)) {
    throw conflict(`An order that is ${order.status.replace(/_/g, ' ').toLowerCase()} cannot move to ${to.replace(/_/g, ' ').toLowerCase()}.`);
  }

  const data: Record<string, unknown> = { status: to };
  switch (to) {
    case 'PREPARING': {
      const m = input.prepMinutes;
      if (!Number.isInteger(m) || m! < 1 || m! > 240) {
        throw badRequest('Accepting an order needs a preparation time between 1 and 240 minutes.');
      }
      data.acceptedAt = now;
      data.estimatedReadyAt = new Date(now.getTime() + m! * 60_000);
      break;
    }
    case 'READY':
      data.readyAt = now;
      break;
    case 'DELIVERED':
      data.completedAt = now;
      break;
    case 'CANCELLED':
      if (!input.cancelReason || !CANCEL_REASONS.includes(input.cancelReason)) {
        throw badRequest('Cancelling an order needs a reason.');
      }
      data.cancelledAt = now;
      data.cancelReason = input.cancelReason;
      data.cancelNote = input.cancelNote?.trim() || null;
      data.cancelledById = input.actorId ?? null;
      break;
  }
  return data;
}
