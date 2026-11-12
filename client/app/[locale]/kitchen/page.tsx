'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Bell, BellOff, ChefHat } from 'lucide-react';
import { useGetAdminOrdersQuery, useUpdateOrderStatusMutation, type Order, type OrderStatus } from '../../../src/api/apiSlice';
import { useLiveConnected } from '../../../src/components/LiveUpdates';
import { useNewOrderAlert } from '../../../src/features/admin/orders/useNewOrderAlert';
import KitchenTicket from '../../../src/features/kitchen/KitchenTicket';
import { useNow } from '../../../src/features/orders/OrderProgress';
import { nextForwardStatus } from '../../../src/features/orders/orderDisplay';
import { apiErrorMessage } from '../../../src/lib/localized';
import { useRequireRole } from '../../../src/routes/useAuthGuard';
import { Button, EmptyState, LoadingBlock, PageContainer, PageHeader, cn, useToast } from '../../../src/components/ui';

const COUNTS: { status: OrderStatus; key: 'new' | 'cooking' | 'ready'; dot: string }[] = [
  { status: 'PENDING', key: 'new', dot: 'bg-line-strong' },
  { status: 'PREPARING', key: 'cooking', dot: 'bg-info' },
  { status: 'READY', key: 'ready', dot: 'bg-success' },
];

/** The kitchen tablet: every open order as a box, oldest first. Accept order → Done. */
export default function KitchenPage() {
  const t = useTranslations('kitchen');
  const tc = useTranslations('common');
  const locale = useLocale();
  const toast = useToast();
  const { ready } = useRequireRole('STAFF');
  const live = useLiveConnected();
  const { data: orders, isLoading } = useGetAdminOrdersQuery(
    { status: 'PENDING,PREPARING,READY' },
    { skip: !ready, pollingInterval: live ? 60_000 : 10_000 },
  );
  const [update] = useUpdateOrderStatusMutation();
  const [busy, setBusy] = useState<string | null>(null);
  const { soundOn, toggleSound } = useNewOrderAlert(orders);
  const now = useNow(10_000); // timers and running lines move on

  const sorted = useMemo(
    () => [...(orders ?? [])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [orders],
  );

  // One tap: accept (the usual cooking time from Settings), Done (ready), then served / picked up / out for delivery.
  const act = async (order: Order) => {
    const next = nextForwardStatus(order);
    if (!next) return;
    setBusy(order.id);
    try {
      await update({ id: order.id, status: next as 'PREPARING' | 'READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' }).unwrap();
    } catch (err) {
      toast({ tone: 'error', title: t('updateFailed'), description: apiErrorMessage(err, locale, tc('tryAgain')) });
    } finally {
      setBusy(null);
    }
  };

  if (!ready) return null;

  return (
    <PageContainer wide className="max-w-none">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={
          <span className="inline-flex items-center gap-2">
            <span className={cn('h-2 w-2 rounded-full', live ? 'bg-success' : 'bg-line-strong')} aria-hidden />
            {live ? t('live') : t('notLive')}
          </span>
        }
        actions={
          <Button variant="secondary" icon={soundOn ? Bell : BellOff} onClick={toggleSound} aria-pressed={soundOn}>
            {soundOn ? t('soundOn') : t('soundOff')}
          </Button>
        }
      />

      {isLoading ? (
        <LoadingBlock label={t('loading')} />
      ) : sorted.length === 0 ? (
        <EmptyState icon={ChefHat} title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <>
          <ul className="mb-4 flex flex-wrap gap-4 text-sm text-fg-muted" aria-label={t('summary')}>
            {COUNTS.map((c) => (
              <li key={c.key} className="inline-flex items-center gap-1.5">
                <span className={cn('h-2.5 w-2.5 rounded-full', c.dot)} aria-hidden />
                {t(`column.${c.key}`)} <span className="font-semibold tabular-nums text-fg">{sorted.filter((o) => o.status === c.status).length}</span>
              </li>
            ))}
          </ul>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {sorted.map((o) => (
              <KitchenTicket key={o.id} order={o} now={now} busy={busy === o.id} onAction={() => act(o)} />
            ))}
          </div>
        </>
      )}
    </PageContainer>
  );
}
