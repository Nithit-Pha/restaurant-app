import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted runs before vi.mock factories, so these are safe to reference.
const { prismaMock, tx } = vi.hoisted(() => {
  const tx = {
    menuItem: { findUnique: vi.fn() },
    modifierGroup: { deleteMany: vi.fn(), update: vi.fn(), create: vi.fn() },
    modifier: { deleteMany: vi.fn(), update: vi.fn(), create: vi.fn() },
  };
  const prismaMock = { $transaction: vi.fn(async (cb: (t: any) => any) => cb(tx)) };
  return { prismaMock, tx };
});

vi.mock('../../config/db', () => ({ prisma: prismaMock }));

import { setItemOptions } from './menu.service';

// The item as stored: one group "Size" with options Regular and Large.
const STORED = {
  id: 'item-1',
  modifierGroups: [{ id: 'g-size', modifiers: [{ id: 'm-reg' }, { id: 'm-lg' }] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  tx.menuItem.findUnique.mockResolvedValue(STORED);
  tx.modifierGroup.update.mockImplementation(async ({ where }: any) => ({ id: where.id }));
  tx.modifierGroup.create.mockResolvedValue({ id: 'g-new' });
});

describe('setItemOptions', () => {
  it('updates kept groups and options, creates new ones and deletes the rest, in order', async () => {
    await setItemOptions('item-1', [
      { name: 'Extras', minSelect: 0, maxSelect: 2, modifiers: [{ name: 'Egg', priceDelta: 10, isAvailable: true }] },
      { id: 'g-size', name: 'Size', minSelect: 1, maxSelect: 1, modifiers: [{ id: 'm-lg', name: 'Large', priceDelta: 20, isAvailable: true }] },
    ]);

    // Groups and options left out are deleted (here: Regular).
    expect(tx.modifierGroup.deleteMany).toHaveBeenCalledWith({ where: { menuItemId: 'item-1', id: { notIn: ['g-size'] } } });
    expect(tx.modifier.deleteMany).toHaveBeenCalledWith({ where: { groupId: 'g-size', id: { notIn: ['m-lg'] } } });
    // The new group comes first, the kept one second.
    expect(tx.modifierGroup.create).toHaveBeenCalledWith({
      data: { name: 'Extras', minSelect: 0, maxSelect: 2, sortOrder: 0, menuItemId: 'item-1' },
    });
    expect(tx.modifierGroup.update).toHaveBeenCalledWith({
      where: { id: 'g-size' },
      data: { name: 'Size', minSelect: 1, maxSelect: 1, sortOrder: 1 },
    });
    expect(tx.modifier.create).toHaveBeenCalledWith({ data: expect.objectContaining({ name: 'Egg', groupId: 'g-new', sortOrder: 0 }) });
    expect(Number(tx.modifier.update.mock.calls[0][0].data.priceDelta)).toBe(20);
  });

  it('refuses a group of another item (400) and changes nothing', async () => {
    await expect(setItemOptions('item-1', [
      { id: 'g-other', name: 'Size', minSelect: 0, maxSelect: 1, modifiers: [{ name: 'X', priceDelta: 0, isAvailable: true }] },
    ])).rejects.toMatchObject({ statusCode: 400 });
    expect(tx.modifierGroup.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses an option moved in from another group (400)', async () => {
    await expect(setItemOptions('item-1', [
      { name: 'New', minSelect: 0, maxSelect: 1, modifiers: [{ id: 'm-reg', name: 'Regular', priceDelta: 0, isAvailable: true }] },
    ])).rejects.toMatchObject({ statusCode: 400 });
    expect(tx.modifierGroup.deleteMany).not.toHaveBeenCalled();
  });

  it('404 for an unknown item', async () => {
    tx.menuItem.findUnique.mockResolvedValue(null);
    await expect(setItemOptions('nope', [])).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('sold out on the menu', () => {
  it('flags a dish whose ingredient does not cover one portion and never sends the recipe', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 'a', name: 'Omelette', recipe: [{ menuItemId: 'a', ingredientId: 'egg', amount: 2, ingredient: { quantity: 1, isActive: true } }] },
      { id: 'b', name: 'Rice', recipe: [{ menuItemId: 'b', ingredientId: 'rice', amount: 0.2, ingredient: { quantity: 3, isActive: true } }] },
      { id: 'c', name: 'Water', recipe: [] },
    ]);
    (prismaMock as any).menuItem = { findMany };
    const { getMenuItems } = await import('./menu.service');
    const items = await getMenuItems();
    expect(items.map((i) => [i.id, i.soldOut])).toEqual([['a', true], ['b', false], ['c', false]]);
    expect(items.every((i) => !('recipe' in i))).toBe(true);
    expect(findMany.mock.calls[0][0].include.recipe).toBeDefined();
  });
});
