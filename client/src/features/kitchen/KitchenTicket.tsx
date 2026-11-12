'use client';

import { useTranslations } from 'next-intl';
import { Bike, Check, ChefHat, Store, UtensilsCrossed } from 'lucide-react';
import type { Order } from '../../api/apiSlice';
import LineDetails from '../orders/LineDetails';
import { formatClock, formatOrderNumber } from '../orders/orderDisplay';
import { useOrderLabels } from '../orders/useOrderLabels';
import { Badge, Button, cn } from '../../components/ui';

export const QUICK_MINUTES = [10, 15, 20] as const;

const minutesBetween = (from: number, to: number) => Math.round((to - from) / 60000);

/** How urgent a ticket is: its timer text and colour. */
export function ticketTiming(order: Order, now: number): { tone: 'ok' | 'soon' | 'late'; key: 'waiting' | 'waitingServe' | 'left' | 'late'; minutes: number } {
  if (order.status === 'PREPARING' && order.estimatedReadyAt) {
    const left = minutesBetween(now, new Date(order.estimatedReadyAt).getTime());
    return { key: left < 0 ? 'late' : 'left', minutes: Math.abs(left), tone: left < 0 ? 'late' : left <= 3 ? 'soon' : 'ok' };
  }
  const since = order.status === 'READY' && order.readyAt ? order.readyAt : order.createdAt;
  const m = Math.max(0, minutesBetween(new Date(since).getTime(), now));
  return { key: order.status === 'READY' ? 'waitingServe' : 'waiting', minutes: m, tone: m >= 10 ? 'late' : m >= 5 ? 'soon' : 'ok' };
}

const TONE: Record<'ok' | 'soon' | 'late', string> = {
  ok: 'border-line',
  soon: 'border-warning shadow-[inset_4px_0_0_rgb(var(--warning))]',
  late: 'border-danger shadow-[inset_4px_0_0_rgb(var(--danger))]',
};

export default function KitchenTicket({ order, now, busy, onAccept, onForward }: {
  order: Order;
  now: number;
  busy: boolean;
  onAccept: (minutes: number) => void;
  onForward: () => void;
}) {
  const t = useTranslations('kitchen');
  const labels = useOrderLabels();
  const timing = ticketTiming(order, now);
  const Icon = order.type === 'DINE_IN' ? UtensilsCrossed : order.type === 'DELIVERY' ? Bike : Store;
  const where = order.type === 'DINE_IN'
    ? (order.tableSession ? t('table', { label: order.tableSession.tableLabel }) : t('dineIn'))
    : order.type === 'DELIVERY' ? t('delivery') : t('pickup');
  const newTable = order.type === 'DINE_IN' && order.tableSession && !order.tableSession.confirmedAt;

  return (
    <article className={cn('flex flex-col gap-3 rounded-card border-2 bg-surface p-4', TONE[timing.tone])} aria-label={`${formatOrderNumber(order)} · ${where}`}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-lg font-semibold text-fg">
            <Icon size={18} aria-hidden className="shrink-0 text-fg-muted" />
            <span className="truncate">{where}</span>
          </p>
          <p className="text-sm tabular-nums text-fg-muted">{formatOrderNumber(order)} · {formatClock(order.createdAt)}</p>
        </div>
        <span className={cn('shrink-0 rounded-control px-2 py-1 text-sm font-semibold tabular-nums',
          timing.tone === 'late' ? 'bg-danger-soft text-danger' : timing.tone === 'soon' ? 'bg-warning-soft text-warning' : 'bg-surface-muted text-fg')}>
          {t(`timer.${timing.key}`, { minutes: timing.minutes })}
        </span>
      </header>
      {newTable && <Badge tone="warning">{t('newTable')}</Badge>}

      <ul className="flex flex-col gap-1.5">
        {order.items.map((i) => (
          <li key={i.id} className="text-base leading-snug text-fg">
            <span className="mr-1.5 inline-block min-w-[1.75rem] font-bold tabular-nums">{i.quantity}×</span>
            <span className="font-medium">{i.nameSnapshot}</span>
            <LineDetails options={i.modifiers} note={i.note} strongNote className="ml-[2.125rem] text-sm" />
          </li>
        ))}
      </ul>

      <footer className="mt-auto flex flex-wrap gap-2 pt-1">
        {order.status === 'PENDING' ? (
          <>
            <span className="w-full text-xs font-medium text-fg-muted">{t('acceptWith')}</span>
            {QUICK_MINUTES.map((m) => (
              <Button key={m} size="lg" className="flex-1" disabled={busy} onClick={() => onAccept(m)} aria-label={t('acceptMinutes', { minutes: m })}>
                {t('minutes', { minutes: m })}
              </Button>
            ))}
          </>
        ) : (
          <Button size="lg" fullWidth icon={order.status === 'PREPARING' ? ChefHat : Check} disabled={busy} onClick={onForward}
            variant={order.status === 'READY' ? 'secondary' : 'primary'}>
            {labels.forwardAction(order)}
          </Button>
        )}
      </footer>
    </article>
  );
}
