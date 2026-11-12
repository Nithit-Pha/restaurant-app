// When order-day drafts are due, and which ingredients start or end an
// urgent spell. Pure (no database, no clock), so it is unit-tested.
import type { OpeningHoursRow } from '../../utils/businessTime';
import { addDays, isEmergency, isOrderDay, isoWeekday, type OrderLevels, type OrderSchedule } from '../suppliers/ordering';

/** Used when the restaurant is closed on the day before an order day. */
export const FALLBACK_DRAFT_TIME = '18:00';

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const dayName = (d: string) => d.replace(/^https?:\/\/schema\.org\//i, '').trim().toLowerCase();
const NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/**
 * Closing time of a day, in minutes after its midnight (can be past 1440 when
 * it closes after midnight; 1440 when open all day). Null when closed that day.
 */
export function closingMinute(hours: OpeningHoursRow[], ymd: string): number | null {
  const name = NAMES[isoWeekday(ymd) - 1];
  const closes = hours
    .filter((row) => row.dayOfWeek.some((d) => dayName(d) === name))
    .map((row) => {
      const o = toMinutes(row.opens);
      const c = toMinutes(row.closes);
      if (o === c) return 1440;
      return c < o ? c + 1440 : c;
    });
  return closes.length ? Math.max(...closes) : null;
}

/** A local wall-clock moment: day plus minutes after its midnight (may run past 1440). */
export interface LocalMoment { ymd: string; minute: number }

const DAY_MS = 86_400_000;
const dayIndex = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
};
/** Comparable number for a local moment. */
export const momentValue = (m: LocalMoment) => dayIndex(m.ymd) * 1440 + m.minute;

/**
 * When the draft for `orderDay` is due: the day before, at the supplier's set
 * time, or else when the restaurant closes that day (18:00 if it is closed).
 */
export function draftDueAt(draftTime: string | null, orderDay: string, hours: OpeningHoursRow[]): LocalMoment {
  const dayBefore = addDays(orderDay, -1);
  if (draftTime) return { ymd: dayBefore, minute: toMinutes(draftTime) };
  const close = hours.length ? closingMinute(hours, dayBefore) : null;
  return { ymd: dayBefore, minute: close ?? toMinutes(FALLBACK_DRAFT_TIME) };
}

/**
 * Order days whose draft is due by `now` and not yet past: today and tomorrow
 * are the only candidates (a draft is due the day before its order day, so
 * a server that was off catches up on today's order day too).
 */
export function dueOrderDays(
  supplier: OrderSchedule & { draftTime: string | null },
  hours: OpeningHoursRow[],
  now: LocalMoment,
): string[] {
  const nowValue = momentValue(now);
  return [now.ymd, addDays(now.ymd, 1)].filter((day) =>
    isOrderDay(supplier, day) && momentValue(draftDueAt(supplier.draftTime, day, hours)) <= nowValue);
}

/**
 * Urgent spells: `start` = ingredients that just fell to their urgent level
 * (add them to an urgent draft once), `end` = ones back above it.
 */
export function urgentChanges<T extends OrderLevels & { id: string; isActive: boolean; urgentSince: Date | null }>(ingredients: T[]) {
  const start: T[] = [];
  const end: T[] = [];
  for (const i of ingredients) {
    const urgent = i.isActive && isEmergency(i);
    if (urgent && !i.urgentSince) start.push(i);
    if (!urgent && i.urgentSince) end.push(i);
  }
  return { start, end };
}
