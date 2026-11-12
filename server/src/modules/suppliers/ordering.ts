// Ordering rules that need no database, so they are unit-tested on their own:
// which days a supplier gets an order, and how many packs to order.
// Dates are business days in Bangkok, written YYYY-MM-DD.

export type Frequency = 'DAILY' | 'WEEKLY' | 'EVERY_N_DAYS' | 'MONTHLY';

export interface OrderSchedule {
  frequency: Frequency;
  weekdays: number[]; // 1 = Monday ... 7 = Sunday
  everyNDays: number | null;
  startDate: string | null;
  monthDay: number | null;
}

const DAY_MS = 86_400_000;
const parts = (ymd: string) => ymd.split('-').map(Number) as [number, number, number];
const dayNumber = (ymd: string) => {
  const [y, m, d] = parts(ymd);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
};
const fromDayNumber = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

export const addDays = (ymd: string, days: number) => fromDayNumber(dayNumber(ymd) + days);

/** 1 = Monday ... 7 = Sunday. */
export function isoWeekday(ymd: string): number {
  const [y, m, d] = parts(ymd);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

export const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Is `ymd` one of the supplier's order days? */
export function isOrderDay(s: OrderSchedule, ymd: string): boolean {
  switch (s.frequency) {
    case 'DAILY':
      return true;
    case 'WEEKLY':
      return s.weekdays.includes(isoWeekday(ymd));
    case 'EVERY_N_DAYS': {
      if (!s.everyNDays || !s.startDate) return false;
      const diff = dayNumber(ymd) - dayNumber(s.startDate);
      return diff >= 0 && diff % s.everyNDays === 0;
    }
    case 'MONTHLY': {
      if (!s.monthDay) return false;
      const [y, m, d] = parts(ymd);
      return d === Math.min(s.monthDay, daysInMonth(y, m)); // the 31st becomes the 30th / 28th
    }
  }
}

/** The next `count` order days from `fromYmd` (included), looking at most a year ahead. */
export function nextOrderDays(s: OrderSchedule, fromYmd: string, count = 3): string[] {
  const out: string[] = [];
  for (let i = 0; i < 400 && out.length < count; i++) {
    const day = addDays(fromYmd, i);
    if (isOrderDay(s, day)) out.push(day);
  }
  return out;
}

/** Problems with a schedule, as a message, or null when it is complete. */
export function scheduleProblem(s: OrderSchedule): string | null {
  if (s.frequency === 'WEEKLY' && s.weekdays.length === 0) return 'Pick at least one weekday.';
  if (s.frequency === 'EVERY_N_DAYS' && (!s.everyNDays || !s.startDate)) return 'Give the number of days and the first order day.';
  if (s.frequency === 'MONTHLY' && !s.monthDay) return 'Pick the day of the month.';
  return null;
}

type Num = number | string | { toString(): string } | null | undefined;
const num = (v: Num): number | null => (v === null || v === undefined ? null : Number(v.toString()));

export interface OrderLevels {
  quantity: Num;
  reorderLevel: Num;
  targetLevel?: Num;
  emergencyLevel?: Num;
  packSize?: Num;
}

/**
 * Levels must stay in order: emergency ≤ reorder ≤ target (each when set).
 * Returns a message, or null when fine.
 */
export function levelProblem(l: Omit<OrderLevels, 'quantity'>): string | null {
  const reorder = num(l.reorderLevel) ?? 0;
  const target = num(l.targetLevel);
  const emergency = num(l.emergencyLevel);
  if (target !== null && target < reorder) return 'The target level must be at least the low-stock level.';
  if (emergency !== null && emergency > reorder) return 'The emergency level must be at or below the low-stock level.';
  if (num(l.packSize) !== null && num(l.packSize)! <= 0) return 'A pack must hold more than 0.';
  return null;
}

/** On the next order: at or below the low-stock (reorder) level. */
export const needsOrder = (l: OrderLevels) => (num(l.quantity) ?? 0) <= (num(l.reorderLevel) ?? 0);

/** Urgent: at or below the emergency level (when one is set). */
export function isEmergency(l: OrderLevels): boolean {
  const emergency = num(l.emergencyLevel);
  return emergency !== null && (num(l.quantity) ?? 0) <= emergency;
}

/**
 * Packs to order: fill up to the target level, rounded up to whole packs.
 * Without a target the low-stock level is the target. Something that needs
 * ordering always gets at least one pack.
 */
export function packsToOrder(l: OrderLevels): number {
  const quantity = num(l.quantity) ?? 0;
  const packSize = num(l.packSize) || 1;
  const target = num(l.targetLevel) ?? num(l.reorderLevel) ?? 0;
  const missing = target - quantity;
  const packs = missing > 0 ? Math.ceil(missing / packSize - 1e-9) : 0;
  return needsOrder(l) ? Math.max(1, packs) : packs;
}
