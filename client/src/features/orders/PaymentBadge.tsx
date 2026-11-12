'use client';

import { useTranslations } from 'next-intl';
import type { Order, PaymentStatus } from '../../api/apiSlice';
import Badge, { type Tone } from '../../components/ui/Badge';
import { useOrderLabels } from './useOrderLabels';

const STATUS_TONE: Record<PaymentStatus, Tone> = {
  UNPAID: 'neutral',
  PENDING: 'warning',
  PAID: 'success',
  REFUNDED: 'danger',
};

/** Payment status pill, e.g. "PromptPay · Paid", or "Table bill · Unpaid" for dine-in (paid together at the counter). */
export default function PaymentBadge({ order, withMethod = true }: {
  order: Pick<Order, 'paymentMethod' | 'paymentStatus'> & { type?: Order['type'] };
  withMethod?: boolean;
}) {
  const labels = useOrderLabels();
  const t = useTranslations('order');
  const method = order.type === 'DINE_IN' && order.paymentStatus !== 'PAID' ? t('payment.tableBill') : labels.paymentMethod(order.paymentMethod);
  return (
    <Badge tone={STATUS_TONE[order.paymentStatus]}>
      {withMethod ? `${method} · ` : ''}
      {labels.paymentStatus(order.paymentStatus)}
    </Badge>
  );
}
