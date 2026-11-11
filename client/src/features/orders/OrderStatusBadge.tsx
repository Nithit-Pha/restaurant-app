'use client';

import type { Order, OrderStatus } from '../../api/apiSlice';
import Badge, { type Tone } from '../../components/ui/Badge';
import { useOrderLabels } from './useOrderLabels';

// Four muted hues + neutral (docs/2026-11-11-ui-redesign.md, "Order statuses").
export const STATUS_TONE: Record<OrderStatus, Tone> = {
  PENDING: 'warning',
  PREPARING: 'info',
  READY: 'success',
  OUT_FOR_DELIVERY: 'info',
  DELIVERED: 'neutral',
  CANCELLED: 'danger',
};

interface Props {
  status: OrderStatus | string;
  type?: Order['type'];
  /** Staff screens use short labels ("New", "Ready"). */
  short?: boolean;
}

export default function OrderStatusBadge({ status, type, short }: Props) {
  const labels = useOrderLabels();
  const label = short ? labels.shortStatus(status as OrderStatus, type) : labels.status(status as OrderStatus, type);
  return (
    <Badge tone={STATUS_TONE[status as OrderStatus] ?? 'neutral'} dot>
      {label}
    </Badge>
  );
}
