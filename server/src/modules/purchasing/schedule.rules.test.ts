import { describe, expect, it } from 'vitest';
import { closingMinute, draftDueAt, dueOrderDays, momentValue, urgentChanges } from './schedule.rules';

const HOURS = [
  { dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Sunday'], opens: '11:00', closes: '21:00' },
  { dayOfWeek: ['Friday', 'Saturday'], opens: '18:00', closes: '02:00' }, // past midnight
];
// 2026-11-16 is a Monday.
const weekly = (weekdays: number[], draftTime: string | null = null) =>
  ({ frequency: 'WEEKLY' as const, weekdays, everyNDays: null, startDate: null, monthDay: null, draftTime });

describe('closing time', () => {
  it('reads the day of the week, also past midnight and all day', () => {
    expect(closingMinute(HOURS, '2026-11-16')).toBe(21 * 60); // Monday
    expect(closingMinute(HOURS, '2026-11-20')).toBe(26 * 60); // Friday, closes 02:00
    expect(closingMinute([{ dayOfWeek: ['Monday'], opens: '00:00', closes: '00:00' }], '2026-11-16')).toBe(1440);
    expect(closingMinute([{ dayOfWeek: ['https://schema.org/Monday'], opens: '10:00', closes: '15:00' }], '2026-11-16')).toBe(900);
  });
  it('is null on a closed day', () => {
    expect(closingMinute([{ dayOfWeek: ['Monday'], opens: '11:00', closes: '21:00' }], '2026-11-17')).toBeNull();
  });
});

describe('draft due time', () => {
  it('is closing time the day before', () => {
    expect(draftDueAt(null, '2026-11-17', HOURS)).toEqual({ ymd: '2026-11-16', minute: 21 * 60 });
  });
  it('runs past midnight when the day before closes late', () => {
    // Order day Saturday; Friday closes 02:00 → due Saturday 02:00.
    const due = draftDueAt(null, '2026-11-21', HOURS);
    expect(momentValue(due)).toBe(momentValue({ ymd: '2026-11-21', minute: 120 }));
  });
  it('uses the set time, or 18:00 when closed the day before or no hours', () => {
    expect(draftDueAt('16:30', '2026-11-17', HOURS)).toEqual({ ymd: '2026-11-16', minute: 16 * 60 + 30 });
    expect(draftDueAt(null, '2026-11-18', [{ dayOfWeek: ['Monday'], opens: '11:00', closes: '21:00' }])).toEqual({ ymd: '2026-11-17', minute: 18 * 60 });
    expect(draftDueAt(null, '2026-11-18', [])).toEqual({ ymd: '2026-11-17', minute: 18 * 60 });
  });
});

describe('due order days', () => {
  const tue = weekly([2]); // order day Tuesday 2026-11-17; due Monday 21:00
  it('is not due before closing the day before', () => {
    expect(dueOrderDays(tue, HOURS, { ymd: '2026-11-16', minute: 20 * 60 + 59 })).toEqual([]);
  });
  it('is due at closing the day before', () => {
    expect(dueOrderDays(tue, HOURS, { ymd: '2026-11-16', minute: 21 * 60 })).toEqual(['2026-11-17']);
  });
  it('catches up on the order day itself (server was off)', () => {
    expect(dueOrderDays(tue, HOURS, { ymd: '2026-11-17', minute: 9 * 60 })).toEqual(['2026-11-17']);
  });
  it('does not go back to earlier order days', () => {
    expect(dueOrderDays(tue, HOURS, { ymd: '2026-11-18', minute: 9 * 60 })).toEqual([]);
  });
  it('can have today and tomorrow due for a daily supplier', () => {
    const daily = { frequency: 'DAILY' as const, weekdays: [], everyNDays: null, startDate: null, monthDay: null, draftTime: '08:00' };
    expect(dueOrderDays(daily, HOURS, { ymd: '2026-11-16', minute: 9 * 60 })).toEqual(['2026-11-16', '2026-11-17']);
  });
});

describe('urgent spells', () => {
  const base = { isActive: true, reorderLevel: 10, emergencyLevel: 3, urgentSince: null as Date | null };
  it('starts once when stock falls to the urgent level and ends above it', () => {
    const { start, end } = urgentChanges([
      { ...base, id: 'new', quantity: 3 }, // just fell → start
      { ...base, id: 'still', quantity: 1, urgentSince: new Date() }, // already started
      { ...base, id: 'back', quantity: 8, urgentSince: new Date() }, // back above → end
      { ...base, id: 'none', quantity: 2, emergencyLevel: null }, // no urgent level
      { ...base, id: 'off', quantity: 0, isActive: false }, // switched off
    ]);
    expect(start.map((i) => i.id)).toEqual(['new']);
    expect(end.map((i) => i.id)).toEqual(['back']);
  });
});
