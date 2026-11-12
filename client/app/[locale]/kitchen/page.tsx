'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Bell, BellOff, ChefHat } from 'lucide-react';
import { useGetAdminOrdersQuery, useUpdateOrderStatusMutation, type Order, type OrderStatus } from '../../../src/api/apiSlice';
import { useLiveConnected } from '../../../src/components/LiveUpdates';
import { useNewOrderAlert } from '../../../src/features/admin/orders/useNewOrderAlert';
import KitchenTicket from '../../../src/features/kitchen/KitchenTicket';
import { nextForwardStatus } from '../../../src/features/orders/orderDisplay';
import { apiErrorMessage } from '../../../src/lib/localized';
import { useRequireRole } from '../../../src/routes/useAuthGuard';
import { Button, EmptyState, LoadingBlock, PageContainer, PageHeader, cn, useToast } from '../../../src/components/ui';

const COLUMNS: { status: OrderStatus; key: 'new' | 'cooking' | 'ready' }[] = [
  { status: 'PENDING', key: 'new' },
  { status: 'PREPARING', key: 'cooking' },
  { status: 'READY', key: 'ready' },
];

/** The kitchen screen (tablet or TV): every open ticket, oldest first, with big buttons. */
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
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { // timers move on every 20 s
    const id = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(id);
  }, []);

  const byStatus = useMemo(() => {
    const sorted = [...(orders ?? [])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return Object.fromEntries(COLUMNS.map((c) => [c.status, sorted.filter((o) => o.status === c.status)])) as Record<OrderStatus, Order[]>;
  }, [orders]);

  const run = async (order: Order, body: { status: 'PREPARING' | 'READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED'; prepMinutes?: number }) => {
    setBusy(order.id);
    try {
      await update({ id: order.id, ...body }).unwrap();
    } catch (err) {
      toast({ tone: 'error', title: t('updateFailed'), description: apiErrorMessage(err, locale, tc('tryAgain')) });
    } finally {
      setBusy(null);
    }
  };

  if (!ready) return null;
  const total = orders?.length ?? 0;

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
      ) : total === 0 ? (
        <EmptyState icon={ChefHat} title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {COLUMNS.map((col) => (
            <section key={col.status} aria-labelledby={`col-${col.key}`} className="flex min-w-0 flex-col gap-3">
              <h2 id={`col-${col.key}`} className="flex items-center justify-between rounded-control bg-surface-muted px-3 py-2 text-sm font-semibold text-fg">
                {t(`column.${col.key}`)}
                <span className="tabular-nums text-fg-muted">{byStatus[col.status].length}</span>
              </h2>
              {byStatus[col.status].map((o) => (
                <KitchenTicket
                  key={o.id}
                  order={o}
                  now={now}
                  busy={busy === o.id}
                  onAccept={(minutes) => run(o, { status: 'PREPARING', prepMinutes: minutes })}
                  onForward={() => {
                    const next = nextForwardStatus(o);
                    if (next && next !== 'PREPARING') void run(o, { status: next as 'READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' });
                  }}
                />
              ))}
            </section>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
