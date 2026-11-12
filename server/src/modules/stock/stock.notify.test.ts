import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const { prismaMock, publishMock } = vi.hoisted(() => ({
  prismaMock: { recipeItem: { findMany: vi.fn() } },
  publishMock: vi.fn(),
}));
vi.mock('../../config/db', () => ({ prisma: prismaMock }));
vi.mock('../../utils/events', () => ({ publish: publishMock }));

import { notifyStockChanged } from './stock.notify';

const fetchMock = vi.fn();
const recipe = (quantity: string) => [{
  menuItemId: 'padthai', ingredientId: 'egg', amount: new Prisma.Decimal(1),
  ingredient: { quantity: new Prisma.Decimal(quantity), isActive: true },
}];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue({ ok: true });
});

describe('notifyStockChanged', () => {
  it('always tells staff screens; refreshes the menu only when the sold-out dishes change', async () => {
    prismaMock.recipeItem.findMany.mockResolvedValue(recipe('5'));
    await notifyStockChanged(); // first time: not known yet -> refresh
    expect(publishMock).toHaveBeenCalledWith({ type: 'stock' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:5173/revalidate', expect.objectContaining({ method: 'POST' }));

    prismaMock.recipeItem.findMany.mockResolvedValue(recipe('4')); // still available
    await notifyStockChanged();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    prismaMock.recipeItem.findMany.mockResolvedValue(recipe('0.5')); // now sold out
    await notifyStockChanged();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(publishMock).toHaveBeenCalledTimes(3);
  });

  it('never throws, even when the website is not reachable', async () => {
    prismaMock.recipeItem.findMany.mockResolvedValue(recipe('9'));
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(notifyStockChanged()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
  });
});
