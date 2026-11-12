import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const { db, prismaMock, stockIn } = vi.hoisted(() => {
  type Row = Record<string, any>;
  const db = { orders: [] as Row[], items: [] as Row[], deliveries: [] as Row[], lines: [] as Row[], expenses: [] as Row[], ingredients: [] as Row[] };
  let n = 0;
  const id = (p: string) => `${p}${++n}`;
  const statusOk = (s: string, cond: any) => (typeof cond === 'string' ? s === cond : cond.in.includes(s));
  const deliveryFull = (d: Row) => {
    const po = db.orders.find((o) => o.id === d.purchaseOrderId)!;
    return {
      ...d,
      lines: db.lines.filter((l) => l.deliveryId === d.id).map((l) => ({ ...l, purchaseOrderItem: db.items.find((i) => i.id === l.purchaseOrderItemId) })),
      purchaseOrder: { number: po.number, supplier: { name: 'Market' }, deliveries: db.deliveries.filter((x) => x.purchaseOrderId === po.id) },
    };
  };
  const prismaMock: Row = {
    purchaseOrder: {
      findUnique: async ({ where }: Row) => {
        const o = db.orders.find((x) => x.id === where.id);
        return o ? { ...o, items: db.items.filter((i) => i.purchaseOrderId === o.id) } : null;
      },
      updateMany: async ({ where, data }: Row) => {
        const rows = db.orders.filter((o) => o.id === where.id && statusOk(o.status, where.status));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      },
      update: async ({ where, data }: Row) => Object.assign(db.orders.find((o) => o.id === where.id)!, data),
    },
    purchaseOrderItem: {
      findMany: async ({ where }: Row) => db.items.filter((i) => i.purchaseOrderId === where.purchaseOrderId)
        .map((i) => ({ ...i, deliveryLines: db.lines.filter((l) => l.purchaseOrderItemId === i.id) })),
    },
    purchaseDelivery: {
      create: async ({ data }: Row) => {
        const { lines, ...rest } = data;
        const d = { id: id('d'), receivedAt: new Date('2026-11-13T03:00:00Z'), priceTotal: null, expenseId: null, ...rest };
        db.deliveries.push(d);
        lines.create.forEach((l: Row) => db.lines.push({ id: id('l'), deliveryId: d.id, ...l }));
        return d;
      },
      findUniqueOrThrow: async ({ where }: Row) => deliveryFull(db.deliveries.find((d) => d.id === where.id)!),
      findUnique: async ({ where }: Row) => {
        const d = db.deliveries.find((x) => x.id === where.id);
        return d ? deliveryFull(d) : null;
      },
      update: async ({ where, data }: Row) => Object.assign(db.deliveries.find((d) => d.id === where.id)!, data),
    },
    purchaseDeliveryLine: { update: async ({ where, data }: Row) => Object.assign(db.lines.find((l) => l.id === where.id)!, data) },
    expense: {
      create: async ({ data }: Row) => { const e = { id: id('e'), ...data }; db.expenses.push(e); return e; },
      update: async ({ where, data }: Row) => Object.assign(db.expenses.find((e) => e.id === where.id)!, data),
      delete: async ({ where }: Row) => { db.expenses.splice(db.expenses.findIndex((e) => e.id === where.id), 1); },
    },
    ingredient: { update: async ({ where, data }: Row) => Object.assign(db.ingredients.find((i) => i.id === where.id)!, data) },
  };
  prismaMock.$transaction = async (fn: (tx: Row) => Promise<unknown>) => fn(prismaMock);
  return { db, prismaMock, stockIn: vi.fn() };
});
vi.mock('../../config/db', () => ({ prisma: prismaMock }));
vi.mock('../../utils/events', () => ({ publish: vi.fn() }));
vi.mock('../../utils/auditLog', () => ({ audit: vi.fn() }));
vi.mock('../stock/stock.notify', () => ({ notifyStockChanged: vi.fn() }));
vi.mock('../stock/stock.service', () => ({ stockInFromDelivery: stockIn }));
vi.mock('./purchasing.service', () => ({ getPurchaseOrder: async (poId: string) => db.orders.find((o) => o.id === poId) }));

import { completeOrder, receiveDelivery, setDeliveryPrices } from './receiving.service';

const D = (x: number) => new Prisma.Decimal(x);
const OWNER = { userId: 'owner', role: 'SUPER_ADMIN' };
const STAFF = { userId: 'ploy', role: 'STAFF' };
const RICE = '00000000-0000-4000-8000-000000000001';
const EGGS = '00000000-0000-4000-8000-000000000002';

beforeEach(() => {
  Object.values(db).forEach((t) => t.splice(0));
  stockIn.mockReset();
  db.orders.push({ id: 'po1', number: 7, status: 'SENT', receivedAt: null });
  db.items.push(
    { id: RICE, purchaseOrderId: 'po1', ingredientId: 'rice', packs: 3, packSize: D(5) }, // 15 kg
    { id: EGGS, purchaseOrderId: 'po1', ingredientId: 'eggs', packs: 2, packSize: D(30) }, // 60 pcs
  );
  db.ingredients.push({ id: 'rice', lastPackPrice: null }, { id: 'eggs', lastPackPrice: null });
});

describe('receiving a delivery', () => {
  it('staff record a part: stock goes up, order is partly received, no expense yet', async () => {
    const po = await receiveDelivery('po1', { lines: [{ itemId: RICE, amount: 15 }, { itemId: EGGS, amount: 0 }], note: null }, STAFF);
    expect(stockIn).toHaveBeenCalledTimes(1); // the 0 line is skipped
    expect(stockIn).toHaveBeenCalledWith(prismaMock, 'rice', D(15), expect.objectContaining({ reason: 'PO-0007', userId: 'ploy' }));
    expect(po).toMatchObject({ status: 'PARTLY_RECEIVED', receivedAt: null });
    expect(db.deliveries[0]).toMatchObject({ receivedById: 'ploy', priceTotal: null });
    expect(db.expenses).toHaveLength(0);
  });

  it('staff cannot enter prices', async () => {
    await expect(receiveDelivery('po1', { lines: [{ itemId: RICE, amount: 15, price: 450 }], note: null }, STAFF))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(stockIn).not.toHaveBeenCalled();
  });

  it('the rest arrives: received, and a priced delivery makes one expense dated on delivery', async () => {
    await receiveDelivery('po1', { lines: [{ itemId: RICE, amount: 15 }], note: null }, STAFF);
    const po = await receiveDelivery('po1', { lines: [{ itemId: EGGS, amount: 60, price: 220 }], note: null }, OWNER);
    expect(po.status).toBe('RECEIVED');
    expect(po.receivedAt).toBeInstanceOf(Date);
    expect(db.expenses).toEqual([expect.objectContaining({
      category: 'FOOD_SUPPLY', amount: D(220), description: 'PO-0007 Market (delivery 2)', date: new Date('2026-11-13T03:00:00Z'),
    })]);
    expect(db.deliveries[1]).toMatchObject({ priceTotal: D(220), expenseId: db.expenses[0].id, pricedById: 'owner' });
    expect(db.ingredients.find((i) => i.id === 'eggs')!.lastPackPrice).toEqual(D(110)); // 2 trays
  });

  it('a delivery cannot come for a draft or a closed order', async () => {
    db.orders[0].status = 'DRAFT';
    await expect(receiveDelivery('po1', { lines: [{ itemId: RICE, amount: 1 }], note: null }, STAFF)).rejects.toMatchObject({ statusCode: 409 });
    db.orders[0].status = 'RECEIVED';
    await expect(receiveDelivery('po1', { lines: [{ itemId: RICE, amount: 1 }], note: null }, STAFF)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('owner prices a delivery later', () => {
  it('adds, changes and clears the one expense', async () => {
    await receiveDelivery('po1', { lines: [{ itemId: RICE, amount: 15 }, { itemId: EGGS, amount: 60 }], note: null }, STAFF);
    const [rice, eggs] = db.lines.map((l) => l.id);

    await setDeliveryPrices('po1', db.deliveries[0].id, { lines: [{ lineId: rice, price: 450 }] }, 'owner');
    expect(db.expenses).toHaveLength(1);
    expect(db.expenses[0].amount).toEqual(D(450));
    expect(db.ingredients[0].lastPackPrice).toEqual(D(150));

    await setDeliveryPrices('po1', db.deliveries[0].id, { lines: [{ lineId: eggs, price: 220.5 }] }, 'owner');
    expect(db.expenses).toHaveLength(1); // still one
    expect(db.expenses[0].amount).toEqual(D(670.5));
    expect(db.deliveries[0].priceTotal).toEqual(D(670.5));

    await setDeliveryPrices('po1', db.deliveries[0].id, { lines: [{ lineId: rice, price: null }, { lineId: eggs, price: null }] }, 'owner');
    expect(db.expenses).toHaveLength(0);
    expect(db.deliveries[0]).toMatchObject({ priceTotal: null, expenseId: null });
  });

  it('closes a partly received order when nothing more is coming', async () => {
    await receiveDelivery('po1', { lines: [{ itemId: RICE, amount: 10 }], note: null }, STAFF);
    expect((await completeOrder('po1', 'owner')).status).toBe('RECEIVED');
    await expect(completeOrder('po1', 'owner')).rejects.toMatchObject({ statusCode: 409 });
  });
});
