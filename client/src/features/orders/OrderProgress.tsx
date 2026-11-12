'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import type { Order, OrderStatus } from '../../api/apiSlice';
import { cn } from '../../components/ui';

/** The steps an order goes through. The kitchen only follows it until Ready. */
export function stepsFor(type: Order['type'], kitchen = false): OrderStatus[] {
  if (kitchen || type === 'DINE_IN') return ['PENDING', 'PREPARING', 'READY'];
  return type === 'DELIVERY'
    ? ['PENDING', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED']
    : ['PENDING', 'PREPARING', 'READY', 'DELIVERED'];
}

/** How far cooking is: 0 at "accepted", 1 at the promised ready time. Over 1 = taking longer. */
export function cookingFraction(order: Pick<Order, 'acceptedAt' | 'estimatedReadyAt'>, now: number): number | null {
  if (!order.acceptedAt || !order.estimatedReadyAt) return null;
  const start = new Date(order.acceptedAt).getTime();
  const end = new Date(order.estimatedReadyAt).getTime();
  if (end <= start) return null;
  return (now - start) / (end - start);
}

/** Re-render every `ms` so the running line moves. */
export function useNow(ms = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

const COLOR = {
  blue: { bg: 'bg-info', border: 'border-info', text: 'text-info' },
  green: { bg: 'bg-success', border: 'border-success', text: 'text-success' },
  orange: { bg: 'bg-warning', border: 'border-warning', text: 'text-warning' },
} as const;

/**
 * Small steps with a line between them: reached steps and the line up to them
 * are blue, the line to the next step fills while it runs (orange when it
 * takes longer than promised), and everything turns green once the food is
 * ready. Grey = not reached yet.
 */
export default function OrderProgress({ order, kitchen = false, size = 'md', now: nowProp, className }: {
  order: Pick<Order, 'status' | 'type' | 'acceptedAt' | 'estimatedReadyAt'>;
  /** Kitchen and dine-in show Received · Cooking · Ready. */
  kitchen?: boolean;
  size?: 'sm' | 'md';
  now?: number;
  className?: string;
}) {
  const t = useTranslations('orderPage.steps');
  const ownNow = useNow();
  const now = nowProp ?? ownNow;
  const steps = stepsFor(order.type, kitchen);
  const current = steps.indexOf(order.status as OrderStatus);
  if (current < 0 && order.status !== 'DELIVERED') return null; // cancelled
  const reached = current < 0 ? steps.length - 1 : current;

  const fraction = order.status === 'PREPARING' ? cookingFraction(order, now) : null;
  const over = fraction !== null && fraction > 1;
  const foodReady = reached >= steps.indexOf('READY');
  const tone = foodReady ? COLOR.green : over ? COLOR.orange : COLOR.blue;
  const finished = order.status === 'DELIVERED' || (kitchen && order.status === 'READY');

  const label: Record<string, string> = {
    PENDING: t('received'),
    PREPARING: kitchen || order.type === 'DINE_IN' ? t('cooking') : t('preparing'),
    READY: t('ready'),
    OUT_FOR_DELIVERY: t('onTheWay'),
    DELIVERED: order.type === 'PICKUP' ? t('pickedUp') : t('delivered'),
  };
  const sm = size === 'sm';
  const dot = sm ? 'h-2.5 w-2.5' : 'h-5 w-5';
  const lineTop = sm ? 'top-[5px]' : 'top-2.5';
  const pct = fraction === null ? null : Math.round(Math.min(1, Math.max(0, fraction)) * 100);

  return (
    <div className={className}>
      <ol className="flex" aria-label={t('label')}>
        {steps.map((s, i) => {
          const isReached = i <= reached;
          // The line into this step: full when reached, running while cooking towards it.
          const fill = isReached ? 100 : i === reached + 1 && pct !== null ? pct : 0;
          return (
            <li key={s} className="relative flex min-w-0 flex-1 flex-col items-center text-center" aria-current={i === reached ? 'step' : undefined}>
              {i > 0 && (
                <span aria-hidden className={cn('absolute right-1/2 h-0.5 w-full -translate-y-1/2 overflow-hidden rounded-full bg-line', lineTop)}>
                  <span
                    className={cn('block h-full rounded-full transition-[width] duration-700 ease-out', tone.bg, fill > 0 && fill < 100 && 'animate-pulse')}
                    style={{ width: `${fill}%` }}
                  />
                </span>
              )}
              <span
                aria-hidden
                className={cn(
                  'relative z-10 flex items-center justify-center rounded-full border-2',
                  dot,
                  isReached ? cn(tone.bg, tone.border, 'text-white') : 'border-line-strong/50 bg-surface',
                )}
              >
                {!sm && isReached && (i < reached || finished) && <Check size={12} strokeWidth={3} />}
              </span>
              <span className={cn('mt-1 w-full px-0.5 leading-tight', sm ? 'text-[10px]' : 'text-xs',
                i === reached ? cn('font-semibold', tone.text) : isReached ? 'text-fg-muted' : 'text-fg-subtle')}>
                {label[s]}
              </span>
            </li>
          );
        })}
      </ol>
      <span className="sr-only">
        {t('srStep', { n: reached + 1, total: steps.length, step: label[steps[reached]] })}
        {pct !== null ? ` · ${pct}%` : ''}
      </span>
    </div>
  );
}
