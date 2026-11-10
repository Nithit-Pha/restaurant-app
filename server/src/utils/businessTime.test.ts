import { describe, it, expect } from 'vitest';
import { businessDate, zonedDayRange, isOpenAt, nextOpening, type OpeningHoursRow } from './businessTime';

const TZ = 'Asia/Bangkok'; // UTC+7, no daylight saving
// Helper: a Bangkok wall-clock time as an instant. 2026-11-11 is a Wednesday.
const bkk = (iso: string) => new Date(`${iso}+07:00`);

const HOURS: OpeningHoursRow[] = [
  { dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Sunday'], opens: '11:00', closes: '21:00' },
  { dayOfWeek: ['Friday', 'Saturday'], opens: '11:00', closes: '22:30' },
];

describe('businessDate / zonedDayRange', () => {
  it('uses the Bangkok calendar day, not UTC', () => {
    // 23:30 UTC on the 10th is already 06:30 on the 11th in Bangkok
    expect(businessDate(new Date('2026-11-10T23:30:00Z'), TZ)).toBe('2026-11-11');
  });

  it('a Bangkok day runs from 17:00 UTC the day before', () => {
    const { start, end } = zonedDayRange('2026-11-11', TZ);
    expect(start.toISOString()).toBe('2026-11-10T17:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-11T16:59:59.999Z');
  });

  it('handles a daylight-saving zone', () => {
    // Berlin switched to summer time on 2026-03-29: that day is 23 hours long
    const { start, end } = zonedDayRange('2026-03-29', 'Europe/Berlin');
    expect(start.toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-29T21:59:59.999Z');
  });
});

describe('isOpenAt', () => {
  it('open inside the hours, closed outside', () => {
    expect(isOpenAt(HOURS, bkk('2026-11-11T12:00:00'), TZ)).toBe(true);
    expect(isOpenAt(HOURS, bkk('2026-11-11T10:59:00'), TZ)).toBe(false);
    expect(isOpenAt(HOURS, bkk('2026-11-11T21:00:00'), TZ)).toBe(false); // closing time itself is closed
  });

  it('uses the right day (Friday closes later)', () => {
    expect(isOpenAt(HOURS, bkk('2026-11-13T22:00:00'), TZ)).toBe(true); // Friday
    expect(isOpenAt(HOURS, bkk('2026-11-12T22:00:00'), TZ)).toBe(false); // Thursday
  });

  it('handles hours past midnight', () => {
    const bar: OpeningHoursRow[] = [{ dayOfWeek: ['Friday'], opens: '18:00', closes: '02:00' }];
    expect(isOpenAt(bar, bkk('2026-11-13T23:30:00'), TZ)).toBe(true); // Friday night
    expect(isOpenAt(bar, bkk('2026-11-14T01:30:00'), TZ)).toBe(true); // early Saturday
    expect(isOpenAt(bar, bkk('2026-11-14T02:30:00'), TZ)).toBe(false);
    expect(isOpenAt(bar, bkk('2026-11-13T01:30:00'), TZ)).toBe(false); // early Friday: Thursday was closed
  });

  it('no hours configured means always open; equal times mean all day', () => {
    expect(isOpenAt([], bkk('2026-11-11T03:00:00'), TZ)).toBe(true);
    expect(isOpenAt([{ dayOfWeek: ['Wednesday'], opens: '00:00', closes: '00:00' }], bkk('2026-11-11T03:00:00'), TZ)).toBe(true);
  });

  it('accepts schema.org day URLs', () => {
    const rows = [{ dayOfWeek: ['https://schema.org/Wednesday'], opens: '09:00', closes: '17:00' }];
    expect(isOpenAt(rows, bkk('2026-11-11T10:00:00'), TZ)).toBe(true);
  });
});

describe('nextOpening', () => {
  it('later today', () => {
    expect(nextOpening(HOURS, bkk('2026-11-11T08:00:00'), TZ)).toEqual({ dayOfWeek: 'Wednesday', time: '11:00', inDays: 0 });
  });

  it('tomorrow after closing', () => {
    expect(nextOpening(HOURS, bkk('2026-11-11T23:00:00'), TZ)).toEqual({ dayOfWeek: 'Thursday', time: '11:00', inDays: 1 });
  });

  it('skips closed days', () => {
    const weekdays = [{ dayOfWeek: ['Monday'], opens: '10:00', closes: '14:00' }];
    expect(nextOpening(weekdays, bkk('2026-11-11T12:00:00'), TZ)).toEqual({ dayOfWeek: 'Monday', time: '10:00', inDays: 5 });
  });

  it('null when no hours are set', () => {
    expect(nextOpening([], bkk('2026-11-11T12:00:00'), TZ)).toBeNull();
  });
});
