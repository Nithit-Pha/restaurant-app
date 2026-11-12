import { describe, it, expect } from 'vitest';
import {
  addDays, isEmergency, isOrderDay, isoWeekday, levelProblem, needsOrder, nextOrderDays, packsToOrder, scheduleProblem,
  type OrderSchedule,
} from './ordering';

const sched = (over: Partial<OrderSchedule>): OrderSchedule => ({ frequency: 'WEEKLY', weekdays: [], everyNDays: null, startDate: null, monthDay: null, ...over });

describe('order days', () => {
  it('knows the weekday (1 = Monday) and moves across months and years', () => {
    expect(isoWeekday('2026-11-12')).toBe(4); // Thursday
    expect(isoWeekday('2026-11-15')).toBe(7); // Sunday
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // leap year
  });

  it('weekly on the chosen weekdays', () => {
    const s = sched({ weekdays: [1, 4] }); // Monday, Thursday
    expect(isOrderDay(s, '2026-11-12')).toBe(true);
    expect(isOrderDay(s, '2026-11-13')).toBe(false);
    expect(nextOrderDays(s, '2026-11-13', 3)).toEqual(['2026-11-16', '2026-11-19', '2026-11-23']);
  });

  it('every N days counts from the first order day, never before it', () => {
    const s = sched({ frequency: 'EVERY_N_DAYS', everyNDays: 3, startDate: '2026-11-10' });
    expect(nextOrderDays(s, '2026-11-01', 3)).toEqual(['2026-11-10', '2026-11-13', '2026-11-16']);
    expect(isOrderDay(s, '2026-11-07')).toBe(false); // 3 days before the start
  });

  it('monthly on the 31st falls on the last day of shorter months', () => {
    const s = sched({ frequency: 'MONTHLY', monthDay: 31 });
    expect(nextOrderDays(s, '2026-01-01', 4)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    expect(isOrderDay(sched({ frequency: 'MONTHLY', monthDay: 29 }), '2028-02-29')).toBe(true);
  });

  it('daily is every day; incomplete schedules are reported', () => {
    expect(nextOrderDays(sched({ frequency: 'DAILY' }), '2026-11-12', 2)).toEqual(['2026-11-12', '2026-11-13']);
    expect(scheduleProblem(sched({}))).toMatch(/weekday/);
    expect(scheduleProblem(sched({ frequency: 'EVERY_N_DAYS', everyNDays: 2 }))).toMatch(/first order day/);
    expect(scheduleProblem(sched({ frequency: 'MONTHLY' }))).toMatch(/day of the month/);
    expect(scheduleProblem(sched({ weekdays: [2] }))).toBeNull();
  });
});

describe('how much to order', () => {
  it('fills up to the target level in whole packs', () => {
    // 50 kg target, 12 kg left, sacks of 25 kg: 38 kg missing → 2 sacks.
    expect(packsToOrder({ quantity: 12, reorderLevel: 20, targetLevel: 50, packSize: 25 })).toBe(2);
    // Exactly 25 kg missing → 1 sack, not 2 (no rounding error).
    expect(packsToOrder({ quantity: '25.000', reorderLevel: '30', targetLevel: '50', packSize: '25' })).toBe(1);
  });

  it('without a target fills up to the low-stock level, and always at least one pack when low', () => {
    expect(packsToOrder({ quantity: 3, reorderLevel: 10, packSize: 4 })).toBe(2);
    expect(packsToOrder({ quantity: 10, reorderLevel: 10, packSize: 4 })).toBe(1); // at the level: still one pack
    expect(packsToOrder({ quantity: -2, reorderLevel: 0, packSize: 1 })).toBe(2); // below 0 after a wrong count
  });

  it('orders nothing above the low-stock level unless the target asks for it', () => {
    expect(packsToOrder({ quantity: 30, reorderLevel: 20, targetLevel: 50, packSize: 25 })).toBe(1);
    expect(packsToOrder({ quantity: 60, reorderLevel: 20, targetLevel: 50, packSize: 25 })).toBe(0);
  });

  it('knows low and emergency, and keeps the levels in order', () => {
    expect(needsOrder({ quantity: 5, reorderLevel: 5 })).toBe(true);
    expect(isEmergency({ quantity: 2, reorderLevel: 5, emergencyLevel: 2 })).toBe(true);
    expect(isEmergency({ quantity: 2, reorderLevel: 5, emergencyLevel: null })).toBe(false);
    expect(levelProblem({ reorderLevel: 10, targetLevel: 5 })).toMatch(/target/);
    expect(levelProblem({ reorderLevel: 10, emergencyLevel: 12 })).toMatch(/emergency/);
    expect(levelProblem({ reorderLevel: 10, targetLevel: 30, emergencyLevel: 2, packSize: 5 })).toBeNull();
  });
});
