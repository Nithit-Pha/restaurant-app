'use client';

import Link from 'next/link';
import { Bike, ChevronRight, Receipt, Store } from 'lucide-react';
import { useGetMyOrdersQuery } from '../../src/api/apiSlice';
import OrderStatusBadge from '../../src/features/orders/OrderStatusBadge';
import PaymentBadge from '../../src/features/orders/PaymentBadge';
import { formatOrderNumber } from '../../src/features/orders/orderDisplay';
import { formatCurrency, formatDate } from '../../src/lib/format';
import { useRequireAuth } from '../../src/routes/useAuthGuard';
import { Card, EmptyState, LoadingBlock, PageContainer, PageHeader, buttonClasses } from '../../src/components/ui';

export default function MyOrdersPage() {
  const { ready } = useRequireAuth();
  const { data: orders = [], isLoading } = useGetMyOrdersQuery(undefined, {
    pollingInterval: 15000,
    skip: !ready,
  });

  if (!ready) return null;

  return (
    <PageContainer>
      <PageHeader title="My Orders" description="Orders update here automatically while the restaurant works on them." />
      <Card className="overflow-hidden">
        {isLoading ? (
          <LoadingBlock label="Loading orders…" />
        ) : orders.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No orders yet."
            description="When you order, you can follow its progress here."
            action={<Link href="/menu" className={buttonClasses('primary')}>Browse the menu</Link>}
          />
        ) : (
          <ul className="divide-y divide-line">
            {orders.map((order) => {
              const count = order.items.reduce((n, i) => n + i.quantity, 0);
              const TypeIcon = order.type === 'DELIVERY' ? Bike : Store;
              return (
                <li key={order.id}>
                  <Link
                    href={`/orders/${order.id}`}
                    className="flex items-center gap-4 px-5 py-4 transition-colors duration-100 hover:bg-surface-hover"
                  >
                    <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-fg-muted sm:flex">
                      <TypeIcon size={18} strokeWidth={1.75} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-semibold tabular-nums text-fg">{formatOrderNumber(order)}</span>
                        <OrderStatusBadge status={order.status} type={order.type} />
                      </span>
                      <span className="mt-1 block text-sm text-fg-muted">
                        {formatDate(order.createdAt)} · {count} {count === 1 ? 'item' : 'items'} ·{' '}
                        {order.type === 'DELIVERY' ? 'Delivery' : 'Pickup'}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-semibold tabular-nums text-fg">{formatCurrency(order.total)}</span>
                      <PaymentBadge order={order} />
                    </span>
                    <ChevronRight size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-fg-subtle" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </PageContainer>
  );
}
