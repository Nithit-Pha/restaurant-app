import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { countChange, isLow, stockInExpenseText } from './stock.rules';
import { countSchema, ingredientPatchSchema, ingredientSchema, stockInSchema, wasteSchema } from './stock.validation';

describe('isLow', () => {
  it('is low at or below the reorder level', () => {
    expect(isLow({ quantity: '2', reorderLevel: '2', isActive: true })).toBe(true);
    expect(isLow({ quantity: '1.999', reorderLevel: '2', isActive: true })).toBe(true);
    expect(isLow({ quantity: '2.001', reorderLevel: '2', isActive: true })).toBe(false);
  });

  it('counts stock below 0 as low', () => {
    expect(isLow({ quantity: new Prisma.Decimal(-0.5), reorderLevel: 0, isActive: true })).toBe(true);
  });

  it('never flags a switched-off ingredient', () => {
    expect(isLow({ quantity: 0, reorderLevel: 5, isActive: false })).toBe(false);
  });
});

describe('countChange', () => {
  it('is the counted amount minus what the app had, without float errors', () => {
    expect(countChange('1.1', '1.3').toString()).toBe('0.2');
    expect(countChange('5', '3.25').toString()).toBe('-1.75');
    expect(countChange('-2', '0').toString()).toBe('2');
    expect(countChange('4', '4').isZero()).toBe(true);
  });
});

describe('stockInExpenseText', () => {
  it('names amount, unit and ingredient, plus the note', () => {
    expect(stockInExpenseText(2.5, 'kg', 'Pork belly')).toBe('Stock in: 2.5 kg Pork belly');
    expect(stockInExpenseText('10', 'pcs', 'Eggs', ' Makro ')).toBe('Stock in: 10 pcs Eggs (Makro)');
  });
});

describe('validation', () => {
  it('accepts a new ingredient and fills defaults', () => {
    const r = ingredientSchema.parse({ name: ' Rice ', unit: 'kg', storage: '' });
    expect(r).toEqual({ name: 'Rice', unit: 'kg', reorderLevel: 0, storage: undefined });
  });

  it('rejects unknown units and more than 3 decimals', () => {
    expect(ingredientSchema.safeParse({ name: 'Rice', unit: 'sack' }).success).toBe(false);
    expect(stockInSchema.safeParse({ amount: 1.2345 }).success).toBe(false);
    expect(stockInSchema.safeParse({ amount: 1.001 }).success).toBe(true);
  });

  it('needs a positive amount and a waste reason; counting 0 is fine', () => {
    expect(stockInSchema.safeParse({ amount: 0 }).success).toBe(false);
    expect(wasteSchema.safeParse({ amount: 1, reason: ' ' }).success).toBe(false);
    expect(countSchema.safeParse({ counted: 0 }).success).toBe(true);
    expect(countSchema.safeParse({ counted: -1 }).success).toBe(false);
  });

  it('turns an empty storage into null when editing and refuses an empty patch', () => {
    expect(ingredientPatchSchema.parse({ storage: '' })).toEqual({ storage: null });
    expect(ingredientPatchSchema.safeParse({}).success).toBe(false);
  });
});
