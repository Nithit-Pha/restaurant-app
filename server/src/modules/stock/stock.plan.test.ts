import { describe, expect, it } from 'vitest';
import { planReturn, planSale, soldOutItems } from './stock.plan';

const str = (moves: { ingredientId: string; change: { toString(): string } }[]) =>
  moves.map((m) => `${m.ingredientId}:${m.change.toString()}`);

describe('planSale', () => {
  const recipes = [
    { menuItemId: 'padthai', ingredientId: 'noodles', amount: '0.15' },
    { menuItemId: 'padthai', ingredientId: 'egg', amount: 1 },
    { menuItemId: 'friedrice', ingredientId: 'rice', amount: '0.2' },
    { menuItemId: 'friedrice', ingredientId: 'egg', amount: 1 },
  ];

  it('multiplies by portions and adds up an ingredient used by several dishes', () => {
    const moves = planSale([{ menuItemId: 'padthai', quantity: 2 }, { menuItemId: 'friedrice', quantity: 3 }], recipes);
    expect(str(moves)).toEqual(['egg:-5', 'noodles:-0.3', 'rice:-0.6']);
  });

  it('sorts by ingredient id (same lock order for every order)', () => {
    const moves = planSale([{ menuItemId: 'friedrice', quantity: 1 }], recipes);
    expect(moves.map((m) => m.ingredientId)).toEqual(['egg', 'rice']);
  });

  it('ignores dishes without a recipe, and the same dish on two lines adds up', () => {
    const moves = planSale([{ menuItemId: 'water', quantity: 4 }, { menuItemId: 'padthai', quantity: 1 }, { menuItemId: 'padthai', quantity: 1 }], recipes);
    expect(str(moves)).toEqual(['egg:-2', 'noodles:-0.3']);
    expect(planSale([{ menuItemId: 'water', quantity: 1 }], recipes)).toEqual([]);
  });

  it('keeps exact decimals (no float drift)', () => {
    const moves = planSale([{ menuItemId: 'x', quantity: 3 }], [{ menuItemId: 'x', ingredientId: 'oil', amount: '0.1' }]);
    expect(str(moves)).toEqual(['oil:-0.3']);
  });
});

describe('planReturn', () => {
  it('gives back exactly what the sale took', () => {
    expect(str(planReturn([{ ingredientId: 'egg', change: '-5' }, { ingredientId: 'rice', change: '-0.600' }]))).toEqual(['egg:5', 'rice:0.6']);
  });

  it('returns nothing for nothing', () => {
    expect(planReturn([])).toEqual([]);
  });
});

describe('soldOutItems', () => {
  const row = (menuItemId: string, amount: string, quantity: string, isActive = true) =>
    ({ menuItemId, ingredientId: `${menuItemId}-ing`, amount, ingredient: { quantity, isActive } });

  it('is sold out when an ingredient has less than one portion', () => {
    expect([...soldOutItems([row('a', '0.2', '0.199'), row('b', '0.2', '0.2'), row('c', '1', '-3')])]).toEqual(['a', 'c']);
  });

  it('ignores switched-off ingredients', () => {
    expect(soldOutItems([row('a', '1', '0', false)]).size).toBe(0);
  });
});
