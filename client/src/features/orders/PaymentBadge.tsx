import type { Order, PaymentMethod, PaymentStatus } from '../../api/apiSlice';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  PROMPTPAY: 'PromptPay',
};

const STATUS_LABELS: Record<PaymentStatus, string> = {
  UNPAID: 'Unpaid',
  PENDING: 'Check transfer',
  PAID: 'Paid',
  REFUNDED: 'Refunded',
};

const STATUS_STYLES: Record<PaymentStatus, string> = {
  UNPAID: 'bg-gray-100 text-gray-700',
  PENDING: 'bg-amber-100 text-amber-800',
  PAID: 'bg-green-100 text-green-800',
  REFUNDED: 'bg-red-100 text-red-800',
};

/** "Cash on delivery" / "Cash at pickup" / "PromptPay" for the customer. */
export function paymentMethodText(order: Pick<Order, 'paymentMethod' | 'type'>): string {
  if (order.paymentMethod === 'PROMPTPAY') return 'PromptPay QR';
  return order.type === 'DELIVERY' ? 'Cash on delivery' : 'Cash at pickup';
}

/** Payment status pill, e.g. "PromptPay · Paid". */
export default function PaymentBadge({ order, withMethod = true }: {
  order: Pick<Order, 'paymentMethod' | 'paymentStatus'>;
  withMethod?: boolean;
}) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${STATUS_STYLES[order.paymentStatus]}`}>
      {withMethod ? `${PAYMENT_METHOD_LABELS[order.paymentMethod]} · ` : ''}
      {STATUS_LABELS[order.paymentStatus]}
    </span>
  );
}
