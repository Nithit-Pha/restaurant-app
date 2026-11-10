// Time-zone aware helpers for the restaurant's business day and opening hours.
// Pure (no DB), so they are unit-tested in isolation.

export interface OpeningHoursRow {
  dayOfWeek: string[]; // 'Monday' … 'Sunday' (a schema.org URL prefix is tolerated)
  opens: string; // 'HH:MM'
  closes: string; // 'HH:MM'; earlier than `opens` means it closes after midnight
}

export interface NextOpening {
  dayOfWeek: string; // 'Monday' …
  time: string; // 'HH:MM'
  inDays: number; // 0 = later today, 1 = tomorrow, …
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
}

/** Calendar fields of `date` as seen on a wall clock in `timeZone`. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'long',
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: DAYS.indexOf(parts.weekday),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The business day `date` falls on, as 'YYYY-MM-DD' in `timeZone`. */
export function businessDate(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Offset of `timeZone` from UTC at instant `ms`, in ms (Bangkok = +7 h). */
function offsetMs(ms: number, timeZone: string): number {
  const p = zonedParts(new Date(ms), timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(ms / 60000) * 60000;
}

/** UTC instant of local midnight at the start of `ymd` in `timeZone`. */
function zonedMidnight(ymd: string, timeZone: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let ms = guess - offsetMs(guess, timeZone);
  ms = guess - offsetMs(ms, timeZone); // second pass settles DST edges
  return new Date(ms);
}

/** [start, end] instants of business day `ymd` ('YYYY-MM-DD') in `timeZone`. */
export function zonedDayRange(ymd: string, timeZone: string): { start: Date; end: Date } {
  const [y, m, d] = ymd.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const nextYmd = `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
  const start = zonedMidnight(ymd, timeZone);
  const end = new Date(zonedMidnight(nextYmd, timeZone).getTime() - 1);
  return { start, end };
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const dayName = (d: string) => d.replace(/^https?:\/\/schema\.org\//i, '').trim().toLowerCase();
const hasDay = (row: OpeningHoursRow, weekday: number) =>
  row.dayOfWeek.some((d) => dayName(d) === DAYS[(weekday + 7) % 7].toLowerCase());

/**
 * Is the restaurant open at `now`? No hours configured = always open.
 * Handles hours that run past midnight (opens 18:00, closes 02:00) and
 * equal open/close times (open all day).
 */
export function isOpenAt(hours: OpeningHoursRow[], now: Date, timeZone: string): boolean {
  if (!hours?.length) return true;
  const p = zonedParts(now, timeZone);
  const t = p.hour * 60 + p.minute;
  return hours.some((row) => {
    const o = minutes(row.opens);
    const c = minutes(row.closes);
    if (o === c) return hasDay(row, p.weekday);
    if (o < c) return hasDay(row, p.weekday) && t >= o && t < c;
    // Overnight: the late part today, or the early-morning tail of yesterday.
    return (hasDay(row, p.weekday) && t >= o) || (hasDay(row, p.weekday - 1) && t < c);
  });
}

/** The next time the restaurant opens after `now` (within a week), or null. */
export function nextOpening(hours: OpeningHoursRow[], now: Date, timeZone: string): NextOpening | null {
  if (!hours?.length) return null;
  const p = zonedParts(now, timeZone);
  const t = p.hour * 60 + p.minute;
  for (let inDays = 0; inDays <= 7; inDays++) {
    const weekday = (p.weekday + inDays) % 7;
    const opens = hours
      .filter((row) => hasDay(row, weekday))
      .map((row) => minutes(row.opens))
      .filter((o) => inDays > 0 || o > t)
      .sort((a, b) => a - b);
    if (opens.length) {
      return { dayOfWeek: DAYS[weekday], time: `${pad(Math.floor(opens[0] / 60))}:${pad(opens[0] % 60)}`, inDays };
    }
  }
  return null;
}
