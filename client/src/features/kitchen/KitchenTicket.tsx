'use client';

import { useTranslations } from 'next-intl';
import { Bike, Check, ChefHat, Play, Store, UtensilsCrossed } from 'lucide-react';
import type { Order } from '../../api/apiSlice';
import LineDetails from '../orders/LineDetails';
import OrderProgress, { cookingFraction } from '../orders/OrderProgress';
import { formatClock, formatOrderNumber } from '../orders/orderDisplay';
import { useOrderLabels } from '../orders/useOrderLabels';
import { Badge, Button, cn } from '../../components/ui';

const minutes = (from: string | null | undefined, now: number) => (from ? Math.max(0, Math.round((now - new Date(from).getTime()) / 60000)) : 0);

/** The timer on a box: waiting, cooking for, or ready for; and how urgent it is. */
export function ticketTiming(order: Order, now: number): { key: 'waiting' | 'cooking' | 'ready'; minutes: number; tone: 'ok' | 'soon' | 'late' } {
  if (order.status === 'PREPARING') {
    const f = cookingFraction(order, now);
    return { key: 'cooking', minutes: minutes(order.acceptedAt, now), tone: f === null ? 'ok' : f > 1 ? 'late' : f > 0.8 ? 'soon' : 'ok' };
  }
  if (order.status === 'READY') {
    const m = minutes(order.readyAt, now);
    return { key: 'ready', minutes: m, tone: m >= 10 ? 'late' : m >= 5 ? 'soon' : 'ok' };
  }
  const m = minutes(order.createdAt, now);
  return { key: 'waiting', minutes: m, tone: m >= 10 ? 'late' : m >= 5 ? 'soon' : 'ok' };
}

/** One order box on the kitchen tablet: Accept order → Done → Served / Picked up / Out for delivery. */
export default function KitchenTicket({ order, now, busy, onAction }: {
  order: Order;
  now: number;
  busy: boolean;
  onAction: () => void;
}) {
  const t = useTranslations('kitchen');
  const labels = useOrderLabels();
  const timing = ticketTiming(order, now);
  const Icon = order.type === 'DINE_IN' ? UtensilsCrossed : order.type === 'DELIVERY' ? Bike : Store;
  const where = order.type === 'DINE_IN'
    ? (order.tableSession ? t('table', { label: order.tableSession.tableLabel }) : t('dineIn'))
    : order.type === 'DELIVERY' ? t('delivery') : t('pickup');
  const newTable = order.type === 'DINE_IN' && order.tableSession && !order.tableSession.confirmedAt;
  const cookedIn = order.status === 'READY' && order.acceptedAt && order.readyAt
    ? Math.max(1, Math.round((new Date(order.readyAt).getTime() - new Date(order.acceptedAt).getTime()) / 60000))
    : null;

  const action = order.status === 'PENDING'
    ? { label: t('accept'), icon: Play, variant: 'primary' as const }
    : order.status === 'PREPARING'
      ? { label: t('done'), icon: ChefHat, variant: 'primary' as const }
      : { label: labels.forwardAction(order), icon: Check, variant: 'secondary' as const };

  return (
    <article
      className={cn('flex flex-col gap-3 rounded-card border bg-surface p-4 shadow-soft',
        timing.tone === 'late' ? 'border-danger' : timing.tone === 'soon' ? 'border-warning' : 'border-line')}
      aria-label={`${formatOrderNumber(order)} · ${where}`}
    >
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
          {cookedIn !== null ? t('cookedIn', { minutes: cookedIn }) : t(`timer.${timing.key}`, { minutes: timing.minutes })}
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

      <div className="mt-auto flex flex-col gap-3 pt-1">
        <Button size="lg" fullWidth icon={action.icon} variant={action.variant} disabled={busy} onClick={onAction}>
          {action.label}
        </Button>
        <OrderProgress order={order} kitchen size="sm" now={now} className="border-t border-line pt-3" />
      </div>
    </article>
  );
}
