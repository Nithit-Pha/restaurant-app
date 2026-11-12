import { describe, expect, it } from 'vitest';
import { canCancel, canEdit, expectedDelivery, formatPoNumber, sendProblem, suggestLines } from './purchasing.rules';

describe('purchase order rules', () => {
  it('formats the number', () => {
    expect(formatPoNumber(7)).toBe('PO-0007');
    expect(formatPoNumber(12345)).toBe('PO-12345');
  });

  it('only drafts can be edited; drafts and sent orders can be cancelled', () => {
    expect(canEdit('DRAFT')).toBe(true);
    expect(canEdit('SENT')).toBe(false);
    expect(canCancel('DRAFT')).toBe(true);
    expect(canCancel('SENT')).toBe(true);
    expect(canCancel('PARTLY_RECEIVED')).toBe(false);
    expect(canCancel('RECEIVED')).toBe(false);
    expect(canCancel('CANCELLED')).toBe(false);
  });

  it('a draft needs at least one line to be sent', () => {
    expect(sendProblem({ status: 'DRAFT', items: [] })).toMatch(/at least one/);
    expect(sendProblem({ status: 'DRAFT', items: [{ packs: 2 }] })).toBeNull();
    expect(sendProblem({ status: 'SENT', items: [{ packs: 2 }] })).toMatch(/Only a draft/);
  });

  it('expected delivery adds the lead time, also across a month end', () => {
    expect(expectedDelivery('2026-11-30', 1)).toBe('2026-12-01');
    expect(expectedDelivery('2026-11-12', 0)).toBe('2026-11-12');
    expect(expectedDelivery('2026-11-12', -3)).toBe('2026-11-12');
  });

  it('suggests low ingredients, filled up to the target in whole packs', () => {
    const lines = suggestLines([
      { id: 'rice', isActive: true, quantity: 4, reorderLevel: 10, targetLevel: 25, packSize: 5 }, // 21 missing → 5 packs
      { id: 'chicken', isActive: true, quantity: 6, reorderLevel: 5, targetLevel: 15, packSize: 1 }, // not low
      { id: 'eggs', isActive: true, quantity: 30, reorderLevel: 30, targetLevel: null, packSize: 30 }, // at the level → 1 pack
      { id: 'old', isActive: false, quantity: 0, reorderLevel: 5, packSize: 1 }, // switched off
    ]);
    expect(lines).toEqual([{ ingredientId: 'rice', packs: 5 }, { ingredientId: 'eggs', packs: 1 }]);
  });
});
