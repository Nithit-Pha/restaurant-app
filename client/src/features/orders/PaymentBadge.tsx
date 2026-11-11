'use client';

import type { Order, PaymentStatus } from '../../api/apiSlice';
import Badge, { type Tone } from '../../components/ui/Badge';
import { useOrderLabels } from './useOrderLabels';

const STATUS_TONE: Record<PaymentStatus, Tone> = {
  UNPAID: 'neutral',
  PENDING: 'warning',
  PAID: 'success',
  REFUNDED: 'danger',
};

/** Payment status pill, e.g. "PromptPay · Paid". */
export default function PaymentBadge({ order, withMethod = true }: {
  order: Pick<Order, 'paymentMethod' | 'paymentStatus'>;
  withMethod?: boolean;
}) {
  const labels = useOrderLabels();
  return (
    <Badge tone={STATUS_TONE[order.paymentStatus]}>
      {withMethod ? `${labels.paymentMethod(order.paymentMethod)} · ` : ''}
      {labels.paymentStatus(order.paymentStatus)}
    </Badge>
  );
}
