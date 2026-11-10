'use client';

import { useGetOpenStatusQuery, type OpenStatus } from '../../api/apiSlice';

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
    <div role="status" className={`rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/30 dark:border-amber-700 px-4 py-3 text-sm text-amber-900 dark:text-amber-200 ${className}`}>
      <span className="font-semibold">We&apos;re closed right now.</span>{' '}
      {data.nextOpening
        ? <>Online ordering opens again {opensAtText(data.nextOpening)}. You can still browse the menu.</>
        : <>Online ordering is paused. You can still browse the menu.</>}
    </div>
  );
}
