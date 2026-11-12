// Display helpers for supplier order days.
import type { Supplier } from './suppliersApi';

const intl = (locale: string) => (locale === 'th' ? 'th-TH' : 'en-GB');

/** Short weekday name for 1 = Monday … 7 = Sunday. */
export function weekdayName(day: number, locale: string, width: 'short' | 'long' = 'short'): string {
  // 2024-01-01 was a Monday.
  return new Intl.DateTimeFormat(intl(locale), { weekday: width, timeZone: 'UTC' }).format(Date.UTC(2024, 0, day));
}

/** "Mon 16 Nov" for a YYYY-MM-DD order day. */
export function orderDayLabel(ymd: string, locale: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat(intl(locale), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, d));
}

type T = (key: string, values?: Record<string, string | number>) => string;

/** One line describing when the supplier is ordered from. */
export function scheduleSummary(s: Pick<Supplier, 'frequency' | 'weekdays' | 'everyNDays' | 'monthDay'>, locale: string, t: T): string {
  switch (s.frequency) {
    case 'DAILY': return t('schedule.daily');
    case 'WEEKLY': return t('schedule.weekly', { days: s.weekdays.map((d) => weekdayName(d, locale)).join(', ') });
    case 'EVERY_N_DAYS': return t('schedule.everyN', { count: s.everyNDays ?? 0 });
    case 'MONTHLY': return t('schedule.monthly', { day: s.monthDay ?? 1 });
  }
}
