import { describe, it, expect } from 'vitest';
import { tableStatusFor } from './tableStatus';

const open = { billRequestedAt: null, closedAt: null };

describe('table status during a visit', () => {
  it('is SEATED before anything is ordered (or when every order was cancelled)', () => {
    expect(tableStatusFor(open, [])).toBe('SEATED');
    expect(tableStatusFor(open, ['CANCELLED'])).toBe('SEATED');
  });

  it('is ORDERED while any order is waiting, cooking or ready', () => {
    expect(tableStatusFor(open, ['PENDING'])).toBe('ORDERED');
    expect(tableStatusFor(open, ['DELIVERED', 'PREPARING'])).toBe('ORDERED');
    expect(tableStatusFor(open, ['DELIVERED', 'READY', 'CANCELLED'])).toBe('ORDERED');
  });

  it('is SERVED when every order that was not cancelled is served', () => {
    expect(tableStatusFor(open, ['DELIVERED', 'CANCELLED', 'DELIVERED'])).toBe('SERVED');
  });

  it('shows a bill request above everything else, and CLEANING once paid', () => {
    expect(tableStatusFor({ billRequestedAt: new Date(), closedAt: null }, ['PREPARING'])).toBe('BILL_REQUESTED');
    expect(tableStatusFor({ billRequestedAt: new Date(), closedAt: new Date() }, ['DELIVERED'])).toBe('CLEANING');
  });
});
