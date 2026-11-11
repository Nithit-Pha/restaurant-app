// Payment rules, separate from the order workflow. Pure, so they are unit-tested.
//
//   UNPAID ──customer "I've transferred" (PromptPay only)──▶ PENDING
//   UNPAID | PENDING ──staff "Mark paid"──▶ PAID
//   PAID ──owner "Refund"──▶ REFUNDED

export type PaymentMethod = 'CASH' | 'PROMPTPAY';
export type PaymentStatus = 'UNPAID' | 'PENDING' | 'PAID' | 'REFUNDED';
export type PaymentAction = 'CUSTOMER_SENT' | 'MARK_PAID' | 'REFUND';

export interface PaymentSnapshot {
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: string; // order status
}

const conflict = (message: string) => Object.assign(new Error(message), { statusCode: 409 });

/** The payment status after `action`, or a 409 error when it is not allowed. */
export function planPayment(order: PaymentSnapshot, action: PaymentAction): PaymentStatus {
  const cancelled = order.status === 'CANCELLED';
  switch (action) {
    case 'CUSTOMER_SENT':
      if (order.paymentMethod !== 'PROMPTPAY') throw conflict('This order is paid in cash.');
      if (cancelled) throw conflict('This order was cancelled.');
      if (order.paymentStatus !== 'UNPAID') throw conflict('This payment is already being handled.');
      return 'PENDING';
    case 'MARK_PAID':
      if (order.paymentStatus === 'PAID') throw conflict('This order is already paid.');
      if (order.paymentStatus === 'REFUNDED') throw conflict('This order was refunded.');
      // A cancelled order can still be marked paid when the customer had
      // already transferred, so it can then be refunded.
      if (cancelled && order.paymentStatus !== 'PENDING') throw conflict('This order was cancelled and nothing was paid.');
      return 'PAID';
    case 'REFUND':
      if (order.paymentStatus !== 'PAID') throw conflict('Only a paid order can be refunded.');
      return 'REFUNDED';
  }
}
