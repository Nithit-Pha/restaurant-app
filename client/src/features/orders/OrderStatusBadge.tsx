import type { Order, OrderStatus } from '../../api/apiSlice';
import { statusLabel, shortStatusLabel } from './orderDisplay';

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  PREPARING: 'bg-blue-100 text-blue-800',
  READY: 'bg-teal-100 text-teal-800',
  OUT_FOR_DELIVERY: 'bg-purple-100 text-purple-800',
  DELIVERED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

interface Props {
  status: OrderStatus | string;
  type?: Order['type'];
  /** Staff screens use short labels ("New", "Ready"). */
  short?: boolean;
}

export default function OrderStatusBadge({ status, type, short }: Props) {
  const label = short ? shortStatusLabel(status as OrderStatus, type) : statusLabel(status as OrderStatus, type);
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {label}
    </span>
  );
}
