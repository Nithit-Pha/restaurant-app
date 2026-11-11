'use client';

import { useGetOpenStatusQuery, type OpenStatus } from '../../api/apiSlice';
import { Alert } from '../../components/ui';

/** "tomorrow at 11:00" / "today at 17:00" / "Monday at 11:00" */
export function opensAtText(next: OpenStatus['nextOpening']): string {
  if (!next) return '';
  const when = next.inDays === 0 ? 'today' : next.inDays === 1 ? 'tomorrow' : next.dayOfWeek;
  return `${when} at ${next.time}`;
}

/**
 * Shown on the menu and at checkout while online ordering is closed
 * (opening hours, or paused by staff), and as a notice while the kitchen is busy.
 */
export default function ClosedBanner({ className = '' }: { className?: string }) {
  const { data } = useGetOpenStatusQuery(undefined, { pollingInterval: 60_000 });
  if (!data) return null;

  if (data.isOpen) {
    if (data.mode !== 'BUSY') return null;
    return (
      <div role="status" className={className}>
        <Alert tone="info" title={<>We&apos;re busy right now.</>}>
          Orders take about {data.busyExtraMinutes} minutes longer than usual.
        </Alert>
      </div>
    );
  }

  if (data.closedReason === 'PAUSED') {
    return (
      <div role="status" className={className}>
        <Alert tone="warning" title="Online ordering is paused.">
          {data.pauseMessage} You can still browse the menu.
        </Alert>
      </div>
    );
  }

  return (
    <div role="status" className={className}>
      <Alert tone="warning" title={<>We&apos;re closed right now.</>}>
        {data.nextOpening
          ? <>Online ordering opens again {opensAtText(data.nextOpening)}. You can still browse the menu.</>
          : <>Online ordering is paused. You can still browse the menu.</>}
      </Alert>
    </div>
  );
}
