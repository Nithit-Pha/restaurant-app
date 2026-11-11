'use client';

import { useTranslations } from 'next-intl';
import { useGetOpenStatusQuery } from '../../api/apiSlice';
import { Alert } from '../../components/ui';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
type Day = (typeof DAYS)[number];

/**
 * Shown on the menu and at checkout while online ordering is closed
 * (opening hours, or paused by staff), and as a notice while the kitchen is busy.
 */
export default function ClosedBanner({ className = '' }: { className?: string }) {
  const t = useTranslations('closed');
  const { data } = useGetOpenStatusQuery(undefined, { pollingInterval: 60_000 });
  if (!data) return null;

  if (data.isOpen) {
    if (data.mode !== 'BUSY') return null;
    return (
      <div role="status" className={className}>
        <Alert tone="info" title={t('busyTitle')}>
          {t('busyText', { minutes: data.busyExtraMinutes })}
        </Alert>
      </div>
    );
  }

  if (data.closedReason === 'PAUSED') {
    return (
      <div role="status" className={className}>
        <Alert tone="warning" title={t('pausedTitle')}>
          {data.pauseMessage} {t('browse')}
        </Alert>
      </div>
    );
  }

  // "tomorrow at 11:00" / "today at 17:00" / "Monday at 11:00"
  const next = data.nextOpening;
  const when = !next
    ? ''
    : next.inDays === 0
      ? t('today', { time: next.time })
      : next.inDays === 1
        ? t('tomorrow', { time: next.time })
        : t('onDay', { day: DAYS.includes(next.dayOfWeek as Day) ? t(`days.${next.dayOfWeek as Day}`) : next.dayOfWeek, time: next.time });

  return (
    <div role="status" className={className}>
      <Alert tone="warning" title={t('closedTitle')}>
        {next ? t('opensAgain', { when }) : t('pausedNoHours')} {t('browse')}
      </Alert>
    </div>
  );
}
