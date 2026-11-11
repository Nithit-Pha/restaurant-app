'use client';

import { useGetOpenStatusQuery, type OpenStatus } from '../../api/apiSlice';
import { Alert } from '../../components/ui';

/** "tomorrow at 11:00" / "today at 17:00" / "Monday at 11:00" */
export function opensAtText(next: OpenStatus['nextOpening']): string {
  if (!next) return '';
  const when = next.inDays === 0 ? 'today' : next.inDays === 1 ? 'tomorrow' : next.dayOfWeek;
  return `${when} at ${next.time}`;
}

/** Shown on the menu and at checkout while online ordering is closed. */
export default function ClosedBanner({ className = '' }: { className?: string }) {
  const { data } = useGetOpenStatusQuery(undefined, { pollingInterval: 60_000 });
  if (!data || data.isOpen) return null;
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
