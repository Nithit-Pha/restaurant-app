import { describe, expect, it } from 'vitest';
import { modeSettings, orderingMode, resolveOrdering } from './orderingMode';

describe('orderingMode', () => {
  it('reads the stored settings', () => {
    expect(orderingMode(0, 0)).toBe('NORMAL');
    expect(orderingMode(0, 20)).toBe('BUSY');
    expect(orderingMode(1, 0)).toBe('PAUSED');
    expect(orderingMode(1, 20)).toBe('PAUSED'); // paused wins
  });
});

describe('modeSettings', () => {
  it('round-trips with orderingMode', () => {
    for (const [mode, extra] of [['NORMAL', 0], ['BUSY', 20], ['PAUSED', 0]] as const) {
      const s = modeSettings(mode, extra);
      expect(orderingMode(s.paused, s.busyExtraMinutes)).toBe(mode);
    }
  });

  it('busy always adds at least one minute; other modes clear the extra time', () => {
    expect(modeSettings('BUSY', 0).busyExtraMinutes).toBe(1);
    expect(modeSettings('BUSY', 14.6).busyExtraMinutes).toBe(15);
    expect(modeSettings('NORMAL', 30).busyExtraMinutes).toBe(0);
    expect(modeSettings('PAUSED', 30).busyExtraMinutes).toBe(0);
  });
});

describe('resolveOrdering', () => {
  it('a pause closes ordering even inside opening hours, or with hours not enforced', () => {
    expect(resolveOrdering({ mode: 'PAUSED', hoursEnforced: true, openByHours: true })).toEqual({ isOpen: false, closedReason: 'PAUSED' });
    expect(resolveOrdering({ mode: 'PAUSED', hoursEnforced: false, openByHours: false })).toEqual({ isOpen: false, closedReason: 'PAUSED' });
  });

  it('outside enforced hours it is closed for HOURS', () => {
    expect(resolveOrdering({ mode: 'NORMAL', hoursEnforced: true, openByHours: false })).toEqual({ isOpen: false, closedReason: 'HOURS' });
  });

  it('busy still takes orders', () => {
    expect(resolveOrdering({ mode: 'BUSY', hoursEnforced: true, openByHours: true })).toEqual({ isOpen: true, closedReason: null });
  });

  it('hours not enforced: always open unless paused', () => {
    expect(resolveOrdering({ mode: 'NORMAL', hoursEnforced: false, openByHours: false })).toEqual({ isOpen: true, closedReason: null });
  });
});
