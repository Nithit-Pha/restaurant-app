import type { Order, PaymentMethod, PaymentStatus } from '../../api/apiSlice';
import Badge, { type Tone } from '../../components/ui/Badge';

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

const STATUS_TONE: Record<PaymentStatus, Tone> = {
  UNPAID: 'neutral',
  PENDING: 'warning',
  PAID: 'success',
  REFUNDED: 'danger',
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
    <Badge tone={STATUS_TONE[order.paymentStatus]}>
      {withMethod ? `${PAYMENT_METHOD_LABELS[order.paymentMethod]} · ` : ''}
      {STATUS_LABELS[order.paymentStatus]}
    </Badge>
  );
}
