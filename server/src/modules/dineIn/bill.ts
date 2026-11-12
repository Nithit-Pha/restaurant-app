// Paying a table's bill: which orders get paid, which must be marked served
// first, and what blocks it. Pure, so it is unit-tested.

export interface BillOrder {
  id: string;
  orderNumber: number | null;
  status: string;
  paymentStatus: string;
  total: number;
}

export interface BillPlan {
  /** Orders paid now (not cancelled, not paid yet). */
  pay: BillOrder[];
  /** Orders still cooking or ready: marked served together with the payment. */
  serve: BillOrder[];
  total: number;
}

const num = (o: BillOrder) => (o.orderNumber != null ? `#${String(o.orderNumber).padStart(3, '0')}` : `#${o.id.slice(0, 8)}`);
const fail = (statusCode: number, message: string, publicCode?: string) => Object.assign(new Error(message), { statusCode, publicCode });

/**
 * Plan the payment of a visit. Throws 409 when there is nothing to pay, when
 * an order was never accepted (accept or cancel it first), or when dishes are
 * not served yet and `markServed` is not set (code NOT_SERVED).
 */
export function planBillPayment(orders: BillOrder[], markServed = false): BillPlan {
  const live = orders.filter((o) => o.status !== 'CANCELLED');
  const pay = live.filter((o) => o.paymentStatus === 'UNPAID' || o.paymentStatus === 'PENDING');
  if (pay.length === 0) throw fail(409, 'There is nothing to pay on this table.');

  const notAccepted = live.filter((o) => o.status === 'PENDING');
  if (notAccepted.length) {
    throw fail(409, `${notAccepted.map(num).join(', ')} ${notAccepted.length === 1 ? 'is' : 'are'} not accepted yet. Accept or cancel ${notAccepted.length === 1 ? 'it' : 'them'} first.`, 'NOT_ACCEPTED');
  }
  const serve = live.filter((o) => o.status !== 'DELIVERED');
  if (serve.length && !markServed) {
    throw fail(409, `Not served yet: ${serve.map(num).join(', ')}. Mark ${serve.length === 1 ? 'it' : 'them'} served and close the bill?`, 'NOT_SERVED');
  }
  const total = Math.round(pay.reduce((s, o) => s + o.total, 0) * 100) / 100;
  return { pay, serve, total };
}
