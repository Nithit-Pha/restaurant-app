import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const { prismaMock, auditMock } = vi.hoisted(() => ({
  prismaMock: {
    ingredient: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    stockMovement: { create: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    recipeItem: { count: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    order: { findUnique: vi.fn(), update: vi.fn() },
    menuItem: { findUnique: vi.fn() },
    expense: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  auditMock: vi.fn(),
}));

vi.mock('../../config/db', () => ({ prisma: prismaMock }));
vi.mock('../../utils/auditLog', () => ({ audit: auditMock }));

import {
  countStock, createIngredient, deductForOrder, listIngredients, returnForOrder, setRecipe, stockIn, updateIngredient, wasteStock,
} from './stock.service';

const D = (v: number | string) => new Prisma.Decimal(v);
const OWNER = { userId: 'owner', role: 'SUPER_ADMIN' };
const STAFF = { userId: 'staff', role: 'STAFF' };
const pork = (over: Record<string, unknown> = {}) => ({
  id: 'ing-1', name: 'Pork', unit: 'kg', quantity: D(5), reorderLevel: D(2), storage: 'Fridge 1', isActive: true, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  // Run transaction callbacks against the same mock.
  prismaMock.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prismaMock));
  prismaMock.stockMovement.create.mockImplementation(({ data }: { data: unknown }) => Promise.resolve(data));
});

describe('listIngredients', () => {
  it('adds the low flag and hides switched-off ones by default', async () => {
    prismaMock.ingredient.findMany.mockResolvedValue([pork({ quantity: D(2) }), pork({ id: 'ing-2', quantity: D(9) })]);
    const rows = await listIngredients();
    expect(prismaMock.ingredient.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
    expect(rows.map((r) => r.low)).toEqual([true, false]);
  });
});

describe('createIngredient', () => {
  it('refuses a name that exists in any spelling', async () => {
    prismaMock.ingredient.findFirst.mockResolvedValue({ id: 'other' });
    await expect(createIngredient({ name: 'pork', unit: 'kg', reorderLevel: 0 }, 'owner')).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.ingredient.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { name: { equals: 'pork', mode: 'insensitive' } },
    }));
  });

  it('records the opening stock as a count', async () => {
    prismaMock.ingredient.findFirst.mockResolvedValue(null);
    prismaMock.ingredient.create.mockResolvedValue(pork({ quantity: D(0) }));
    prismaMock.ingredient.update.mockResolvedValue({ quantity: D(3) });
    prismaMock.ingredient.findUniqueOrThrow.mockResolvedValue(pork({ quantity: D(3) }));
    const created = await createIngredient({ name: 'Pork', unit: 'kg', reorderLevel: 2, openingStock: 3 }, 'owner');
    expect(prismaMock.stockMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      type: 'COUNT_ADJUST', change: D(3), quantityAfter: D(3), reason: 'Opening stock', userId: 'owner',
    }) });
    expect(created.low).toBe(false);
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', entityType: 'INGREDIENT' }));
  });
});

describe('updateIngredient', () => {
  it('keeps the unit once stock was recorded or a recipe uses it', async () => {
    prismaMock.ingredient.findUnique.mockResolvedValue(pork());
    prismaMock.stockMovement.count.mockResolvedValue(1);
    prismaMock.recipeItem.count.mockResolvedValue(0);
    await expect(updateIngredient('ing-1', { unit: 'g' }, 'owner')).rejects.toMatchObject({ statusCode: 409 });
    prismaMock.stockMovement.count.mockResolvedValue(0);
    prismaMock.recipeItem.count.mockResolvedValue(2);
    await expect(updateIngredient('ing-1', { unit: 'g' }, 'owner')).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.ingredient.update).not.toHaveBeenCalled();
  });

  it('logs switching an ingredient off as DEACTIVATE', async () => {
    prismaMock.ingredient.findUnique.mockResolvedValue(pork());
    prismaMock.ingredient.update.mockResolvedValue(pork({ isActive: false }));
    await updateIngredient('ing-1', { isActive: false }, 'owner');
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'DEACTIVATE' }));
  });
});

describe('stockIn', () => {
  beforeEach(() => {
    prismaMock.ingredient.findUnique.mockResolvedValue(pork());
    prismaMock.ingredient.update.mockResolvedValue({ quantity: D(7.5) });
  });

  it('adds stock with one atomic increment', async () => {
    const move = await stockIn('ing-1', { amount: 2.5 }, STAFF);
    expect(prismaMock.ingredient.update).toHaveBeenCalledWith(expect.objectContaining({ data: { quantity: { increment: D(2.5) } } }));
    expect(move).toMatchObject({ type: 'PURCHASE', change: D(2.5), quantityAfter: D(7.5), userId: 'staff' });
    expect(prismaMock.expense.create).not.toHaveBeenCalled();
  });

  it('with a price, the owner also gets a Food supply expense linked to the move', async () => {
    prismaMock.expense.create.mockResolvedValue({ id: 'exp-1' });
    const move = await stockIn('ing-1', { amount: 2.5, price: 450, note: 'Makro' }, OWNER);
    expect(prismaMock.expense.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      amount: D(450), category: 'FOOD_SUPPLY', description: 'Stock in: 2.5 kg Pork (Makro)', createdById: 'owner',
    }) });
    expect(move).toMatchObject({ expenseId: 'exp-1', reason: 'Makro' });
  });

  it('refuses a price from staff', async () => {
    await expect(stockIn('ing-1', { amount: 1, price: 100 }, STAFF)).rejects.toMatchObject({ statusCode: 403 });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a switched-off or unknown ingredient', async () => {
    prismaMock.ingredient.findUnique.mockResolvedValueOnce(pork({ isActive: false }));
    await expect(stockIn('ing-1', { amount: 1 }, STAFF)).rejects.toMatchObject({ statusCode: 409 });
    prismaMock.ingredient.findUnique.mockResolvedValueOnce(null);
    await expect(stockIn('nope', { amount: 1 }, STAFF)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('countStock', () => {
  it('sets the counted amount and records the difference', async () => {
    prismaMock.ingredient.findUnique.mockResolvedValue(pork({ quantity: D('5.25') }));
    prismaMock.ingredient.updateMany.mockResolvedValue({ count: 1 });
    const move = await countStock('ing-1', { counted: 4 }, STAFF);
    expect(prismaMock.ingredient.updateMany).toHaveBeenCalledWith({ where: { id: 'ing-1', quantity: D('5.25') }, data: { quantity: D(4) } });
    expect(move).toMatchObject({ type: 'COUNT_ADJUST', quantityAfter: D(4) });
    expect((move as unknown as { change: Prisma.Decimal }).change.toString()).toBe('-1.25');
  });

  it('asks to count again when the stock changed meanwhile', async () => {
    prismaMock.ingredient.findUnique.mockResolvedValue(pork());
    prismaMock.ingredient.updateMany.mockResolvedValue({ count: 0 });
    await expect(countStock('ing-1', { counted: 4 }, STAFF)).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.stockMovement.create).not.toHaveBeenCalled();
  });
});

describe('wasteStock', () => {
  it('takes the amount out with the reason; stock may go below 0', async () => {
    prismaMock.ingredient.findUnique.mockResolvedValue(pork({ quantity: D(1) }));
    prismaMock.ingredient.update.mockResolvedValue({ quantity: D(-1) });
    const move = await wasteStock('ing-1', { amount: 2, reason: 'Dropped' }, STAFF);
    expect(prismaMock.ingredient.update).toHaveBeenCalledWith(expect.objectContaining({ data: { quantity: { increment: D(-2) } } }));
    expect(move).toMatchObject({ type: 'WASTE', change: D(-2), quantityAfter: D(-1), reason: 'Dropped' });
  });
});

describe('deductForOrder', () => {
  it('takes recipe amount × portions out once and marks the order', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      orderNumber: 42, stockDeductedAt: null, items: [{ menuItemId: 'padthai', quantity: 2 }, { menuItemId: 'water', quantity: 1 }],
    });
    prismaMock.recipeItem.findMany.mockResolvedValue([
      { menuItemId: 'padthai', ingredientId: 'noodles', amount: D('0.15') },
      { menuItemId: 'padthai', ingredientId: 'egg', amount: D(1) },
    ]);
    prismaMock.ingredient.update.mockResolvedValue({ quantity: D(10) });
    const moves = await deductForOrder(prismaMock as never, 'o1', 'cook');
    expect(moves.map((m) => `${m.ingredientId}:${m.change}`)).toEqual(['egg:-2', 'noodles:-0.3']);
    expect(prismaMock.stockMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      ingredientId: 'egg', type: 'SALE', change: D(-2), orderId: 'o1', userId: 'cook', reason: '#042',
    }) });
    expect(prismaMock.order.update).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { stockDeductedAt: expect.any(Date) } });
  });

  it('does nothing the second time', async () => {
    prismaMock.order.findUnique.mockResolvedValue({ orderNumber: 1, stockDeductedAt: new Date(), items: [] });
    expect(await deductForOrder(prismaMock as never, 'o1')).toEqual([]);
    expect(prismaMock.ingredient.update).not.toHaveBeenCalled();
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });
});

describe('returnForOrder', () => {
  it('gives back what the SALE movements took, once', async () => {
    prismaMock.order.findUnique.mockResolvedValue({ orderNumber: 7, stockDeductedAt: new Date(), stockReturnedAt: null });
    prismaMock.stockMovement.findMany.mockResolvedValue([{ ingredientId: 'egg', change: D(-2) }]);
    prismaMock.ingredient.update.mockResolvedValue({ quantity: D(12) });
    const moves = await returnForOrder(prismaMock as never, 'o1', 'staff');
    expect(prismaMock.stockMovement.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { orderId: 'o1', type: 'SALE' } }));
    expect(moves.map((m) => `${m.ingredientId}:${m.change}`)).toEqual(['egg:2']);
    expect(prismaMock.stockMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: 'SALE_RETURN', change: D(2), reason: '#007' }) });
    expect(prismaMock.order.update).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { stockReturnedAt: expect.any(Date) } });
  });

  it('does nothing for an order that never took stock or already gave it back', async () => {
    prismaMock.order.findUnique.mockResolvedValueOnce({ orderNumber: 1, stockDeductedAt: null, stockReturnedAt: null });
    expect(await returnForOrder(prismaMock as never, 'o1')).toEqual([]);
    prismaMock.order.findUnique.mockResolvedValueOnce({ orderNumber: 1, stockDeductedAt: new Date(), stockReturnedAt: new Date() });
    expect(await returnForOrder(prismaMock as never, 'o1')).toEqual([]);
    expect(prismaMock.stockMovement.findMany).not.toHaveBeenCalled();
  });
});

describe('setRecipe', () => {
  const ING_A = '11111111-1111-4111-8111-111111111111';
  const ING_B = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    prismaMock.menuItem.findUnique.mockResolvedValue({ id: 'm1', name: 'Pad thai' });
    prismaMock.recipeItem.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockResolvedValue([]);
  });

  it('replaces the whole recipe', async () => {
    prismaMock.ingredient.count.mockResolvedValue(2);
    await setRecipe('m1', [{ ingredientId: ING_A, amount: 0.15 }, { ingredientId: ING_B, amount: 1 }], 'owner');
    expect(prismaMock.recipeItem.deleteMany).toHaveBeenCalledWith({ where: { menuItemId: 'm1' } });
    expect(prismaMock.recipeItem.createMany).toHaveBeenCalledWith({ data: [
      { menuItemId: 'm1', ingredientId: ING_A, amount: D(0.15) },
      { menuItemId: 'm1', ingredientId: ING_B, amount: D(1) },
    ] });
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'MENU_ITEM', entityId: 'm1' }));
  });

  it('refuses the same ingredient twice or an unknown one', async () => {
    await expect(setRecipe('m1', [{ ingredientId: ING_A, amount: 1 }, { ingredientId: ING_A, amount: 2 }], 'owner')).rejects.toMatchObject({ statusCode: 400 });
    prismaMock.ingredient.count.mockResolvedValue(1);
    await expect(setRecipe('m1', [{ ingredientId: ING_A, amount: 1 }, { ingredientId: ING_B, amount: 2 }], 'owner')).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.recipeItem.deleteMany).not.toHaveBeenCalled();
  });
});
