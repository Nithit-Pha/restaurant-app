// Busy mode: staff can slow down or pause online ordering during a rush.
// Pure, so it is unit-tested in isolation.

export type OrderingMode = 'NORMAL' | 'BUSY' | 'PAUSED';
export type ClosedReason = 'HOURS' | 'PAUSED';

export const DEFAULT_PAUSE_MESSAGE = "We're not taking new orders right now. Please try again a little later.";

/** Stored settings -> mode. Paused wins; any extra minutes means busy. */
export function orderingMode(paused: number, busyExtraMinutes: number): OrderingMode {
  if (paused !== 0) return 'PAUSED';
  return busyExtraMinutes > 0 ? 'BUSY' : 'NORMAL';
}

/** Mode -> what to store. Busy needs its extra minutes; the others clear them. */
export function modeSettings(mode: OrderingMode, extraMinutes = 0): { paused: number; busyExtraMinutes: number } {
  if (mode === 'PAUSED') return { paused: 1, busyExtraMinutes: 0 };
  if (mode === 'BUSY') return { paused: 0, busyExtraMinutes: Math.max(1, Math.round(extraMinutes)) };
  return { paused: 0, busyExtraMinutes: 0 };
}

/**
 * Can customers order right now, and if not, why? A pause applies at any
 * hour; opening hours only apply when the owner enforces them.
 */
export function resolveOrdering(input: { mode: OrderingMode; hoursEnforced: boolean; openByHours: boolean }): {
  isOpen: boolean;
  closedReason: ClosedReason | null;
} {
  if (input.mode === 'PAUSED') return { isOpen: false, closedReason: 'PAUSED' };
  if (input.hoursEnforced && !input.openByHours) return { isOpen: false, closedReason: 'HOURS' };
  return { isOpen: true, closedReason: null };
}
