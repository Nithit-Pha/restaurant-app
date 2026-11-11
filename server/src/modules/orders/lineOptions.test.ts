import { describe, expect, it } from 'vitest';
import { priceLine, type OptionGroup } from './lineOptions';

const SIZE: OptionGroup = {
  id: 'size', name: 'Size', minSelect: 1, maxSelect: 1,
  modifiers: [
    { id: 'reg', name: 'Regular', priceDelta: 0, isAvailable: true },
    { id: 'lg', name: 'Large', priceDelta: 20, isAvailable: true },
  ],
};
const EXTRAS: OptionGroup = {
  id: 'extras', name: 'Extras', minSelect: 0, maxSelect: 2,
  modifiers: [
    { id: 'egg', name: 'Fried egg', priceDelta: 15, isAvailable: true },
    { id: 'cheese', name: 'Cheese', priceDelta: 10.5, isAvailable: true },
    { id: 'shrimp', name: 'Shrimp', priceDelta: 40, isAvailable: false },
  ],
};
const item = { name: 'Pad Thai', sellingPrice: 89, modifierGroups: [SIZE, EXTRAS] };

describe('priceLine', () => {
  it('no option groups: the plain price', () => {
    expect(priceLine({ name: 'Lemonade', sellingPrice: 59, modifierGroups: [] }, [])).toEqual({ unitPrice: 59, options: [] });
  });

  it('adds the chosen options to the price, in menu order', () => {
    const { unitPrice, options } = priceLine(item, ['cheese', 'lg', 'egg']);
    expect(unitPrice).toBe(134.5); // 89 + 20 + 15 + 10.5
    expect(options.map((o) => o.name)).toEqual(['Large', 'Fried egg', 'Cheese']);
    expect(options[0]).toEqual({ modifierId: 'lg', groupName: 'Size', name: 'Large', priceDelta: 20, position: 0 });
  });

  it('requires a choice for required groups', () => {
    expect(() => priceLine(item, ['egg'])).toThrow('Please choose Size for Pad Thai.');
  });

  it('limits how many can be chosen in a group', () => {
    expect(() => priceLine(item, ['reg', 'lg'])).toThrow('Choose at most 1 for Size');
  });

  it('refuses unavailable, unknown and repeated options', () => {
    expect(() => priceLine(item, ['reg', 'shrimp'])).toThrow('Shrimp is not available');
    expect(() => priceLine(item, ['reg', 'from-another-dish'])).toThrow('do not belong to Pad Thai');
    expect(() => priceLine(item, ['reg', 'egg', 'egg'])).toThrow('chosen twice');
  });

  it('allows a negative price change but not a negative total', () => {
    const small = { ...SIZE, modifiers: [{ id: 'sm', name: 'Small', priceDelta: -20, isAvailable: true }] };
    expect(priceLine({ ...item, modifierGroups: [small] }, ['sm']).unitPrice).toBe(69);
    const silly = { ...SIZE, modifiers: [{ id: 'x', name: 'Free?', priceDelta: -100, isAvailable: true }] };
    expect(() => priceLine({ ...item, modifierGroups: [silly] }, ['x'])).toThrow('less than nothing');
  });

  it('errors carry HTTP 400', () => {
    try { priceLine(item, []); } catch (err) { expect((err as { statusCode?: number }).statusCode).toBe(400); }
    expect.assertions(1);
  });
});
