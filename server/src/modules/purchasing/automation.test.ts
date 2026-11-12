import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

// A small in-memory database with just what automation.ts uses.
const { db, prismaMock, publishMock } = vi.hoisted(() => {
  type Row = Record<string, any>;
  const db = { suppliers: [] as Row[], ingredients: [] as Row[], orders: [] as Row[], items: [] as Row[], checks: [] as Row[] };
  let n = 0;
  const inList = (v: unknown, cond: any) => (cond?.in ? cond.in.includes(v) : cond?.notIn ? !cond.notIn.includes(v) : cond === undefined || v === cond);
  const orderOf = (item: Row) => db.orders.find((o) => o.id === item.purchaseOrderId)!;
  const clash = () => Object.assign(new Error('unique'), { code: 'P2002' });
  const prismaMock: Row = {
    supplier: {
      findMany: async () => db.suppliers.filter((s) => s.isActive).map((s) => ({ ...s, ingredients: db.ingredients.filter((i) => i.supplierId === s.id && i.isActive) })),
    },
    orderDayCheck: {
      create: async ({ data }: Row) => {
        if (db.checks.some((c) => c.supplierId === data.supplierId && c.orderDay === data.orderDay)) {
          const { Prisma: P } = await import('@prisma/client');
          throw new P.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' });
        }
        db.checks.push({ ...data, purchaseOrderId: null });
        return data;
      },
      update: async ({ where, data }: Row) => {
        const c = db.checks.find((x) => x.supplierId === where.supplierId_orderDay.supplierId && x.orderDay === where.supplierId_orderDay.orderDay)!;
        return Object.assign(c, data);
      },
    },
    purchaseOrder: {
      findFirst: async ({ where }: Row) => [...db.orders].reverse().find((o) => o.supplierId === where.supplierId && o.status === where.status && inList(o.source, where.source)) ?? null,
      create: async ({ data }: Row) => {
        if (data.orderDay && db.orders.some((o) => o.supplierId === data.supplierId && o.orderDay === data.orderDay)) throw clash();
        const o = { id: `po${++n}`, status: 'DRAFT', source: 'MANUAL', orderDay: null, ...data };
        db.orders.push(o);
        return o;
      },
    },
    purchaseOrderItem: {
      findMany: async ({ where }: Row) => db.items.filter((i) =>
        inList(i.purchaseOrderId, where.purchaseOrderId) && inList(i.ingredientId, where.ingredientId)
        && (!where.purchaseOrder || where.purchaseOrder.status.in.includes(orderOf(i).status))),
      createMany: async ({ data }: Row) => {
        const fresh = data.filter((d: Row) => !db.items.some((i) => i.purchaseOrderId === d.purchaseOrderId && i.ingredientId === d.ingredientId));
        db.items.push(...fresh);
        return { count: fresh.length };
      },
    },
    ingredient: {
      findMany: async ({ where }: Row) => {
        if (where.id) return db.ingredients.filter((i) => where.id.in.includes(i.id));
        return db.ingredients
          .filter((i) => i.emergencyLevel !== null || i.urgentSince !== null)
          .map((i) => ({ ...i, supplier: db.suppliers.find((s) => s.id === i.supplierId) ?? null }));
      },
      updateMany: async ({ where, data }: Row) => {
        const rows = db.ingredients.filter((i) => where.id.in.includes(i.id) && (where.urgentSince === undefined || i.urgentSince === where.urgentSince));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      },
    },
  };
  prismaMock.$transaction = async (fn: (tx: Row) => Promise<unknown>) => fn(prismaMock);
  return { db, prismaMock, publishMock: vi.fn() };
});
vi.mock('../../config/db', () => ({ prisma: prismaMock }));
vi.mock('../../utils/events', () => ({ publish: publishMock }));
vi.mock('../settings/settings.service', () => ({
  getRestaurantProfile: async () => ({ openingHours: [{ dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], opens: '11:00', closes: '21:00' }] }),
}));

import { checkOrderDays, checkUrgent } from './automation';

const D = (n: number | string | null) => (n === null ? null : new Prisma.Decimal(n));
const at = (iso: string) => new Date(`${iso}+07:00`); // Bangkok wall clock
const ingredient = (id: string, quantity: number, extra: Record<string, unknown> = {}) => ({
  id, name: id, unit: 'kg', isActive: true, supplierId: 's1', quantity: D(quantity), reorderLevel: D(10), targetLevel: D(25),
  emergencyLevel: null as Prisma.Decimal | null, packName: null, packSize: D(5), urgentSince: null as Date | null, ...extra,
});

beforeEach(() => {
  db.orders.length = 0; db.items.length = 0; db.checks.length = 0;
  // Tuesdays (2026-11-17 is a Tuesday): draft due Monday 21:00.
  db.suppliers.splice(0, db.suppliers.length, { id: 's1', name: 'Market', isActive: true, frequency: 'WEEKLY', weekdays: [2], everyNDays: null, startDate: null, monthDay: null, draftTime: null, leadTimeDays: 1 });
  db.ingredients.splice(0, db.ingredients.length, ingredient('rice', 4), ingredient('chicken', 20));
});

describe('order-day drafts', () => {
  it('waits for closing time the day before', async () => {
    expect(await checkOrderDays(at('2026-11-16T20:55'))).toBe(0);
    expect(db.orders).toHaveLength(0);
  });

  it('makes one draft with the low ingredients, once per order day', async () => {
    expect(await checkOrderDays(at('2026-11-16T21:00'))).toBe(1);
    expect(db.orders).toEqual([expect.objectContaining({ source: 'SCHEDULED', orderDay: '2026-11-17', expectedDate: '2026-11-18' })]);
    expect(db.items.map((i) => [i.ingredientId, i.packs])).toEqual([['rice', 5]]); // 21 kg missing → 5 bags of 5 kg
    // Owner removes the line; later runs must not put it back.
    db.items.length = 0;
    expect(await checkOrderDays(at('2026-11-16T21:05'))).toBe(0);
    expect(await checkOrderDays(at('2026-11-17T08:00'))).toBe(0);
    expect(db.items).toHaveLength(0);
    expect(db.orders).toHaveLength(1);
  });

  it('catches up on the order day after the server was off', async () => {
    expect(await checkOrderDays(at('2026-11-17T09:30'))).toBe(1);
    expect(db.orders[0]).toMatchObject({ orderDay: '2026-11-17', expectedDate: '2026-11-18' });
  });

  it('makes no empty draft when nothing is low, but still marks the day as checked', async () => {
    db.ingredients[0].quantity = D(30);
    expect(await checkOrderDays(at('2026-11-16T21:00'))).toBe(0);
    expect(db.orders).toHaveLength(0);
    expect(db.checks).toEqual([expect.objectContaining({ supplierId: 's1', orderDay: '2026-11-17', purchaseOrderId: null })]);
  });

  it('adds to an open draft instead of making a second one, keeping the owner\'s lines', async () => {
    db.orders.push({ id: 'mine', supplierId: 's1', status: 'DRAFT', source: 'MANUAL', orderDay: null });
    db.items.push({ purchaseOrderId: 'mine', ingredientId: 'chicken', packs: 2 });
    expect(await checkOrderDays(at('2026-11-16T21:00'))).toBe(1);
    expect(db.orders).toHaveLength(1);
    expect(db.items.map((i) => [i.ingredientId, i.packs])).toEqual([['chicken', 2], ['rice', 5]]);
  });

  it('leaves out ingredients already on a sent order', async () => {
    db.orders.push({ id: 'sent', supplierId: 's1', status: 'SENT', source: 'MANUAL', orderDay: null });
    db.items.push({ purchaseOrderId: 'sent', ingredientId: 'rice', packs: 5 });
    expect(await checkOrderDays(at('2026-11-16T21:00'))).toBe(0);
    expect(db.orders).toHaveLength(1);
  });
});

describe('urgent drafts', () => {
  it('adds an ingredient once when it falls to its urgent level', async () => {
    db.ingredients[0].emergencyLevel = D(5); // rice: 4 kg ≤ 5
    expect(await checkUrgent(at('2026-11-12T14:00'))).toBe(1);
    expect(db.orders).toEqual([expect.objectContaining({ source: 'EMERGENCY', supplierId: 's1', expectedDate: '2026-11-13' })]);
    expect(db.items.map((i) => [i.ingredientId, i.packs])).toEqual([['rice', 5]]);
    expect(db.ingredients[0].urgentSince).toBeInstanceOf(Date);

    // Owner removes it from the draft: it does not come back while still urgent.
    db.items.length = 0;
    expect(await checkUrgent(at('2026-11-12T14:05'))).toBe(0);
    expect(db.items).toHaveLength(0);

    // Back above, then down again: a new drop, added again to the open urgent draft.
    db.ingredients[0].quantity = D(12);
    await checkUrgent(at('2026-11-12T15:00'));
    expect(db.ingredients[0].urgentSince).toBeNull();
    db.ingredients[0].quantity = D(2);
    expect(await checkUrgent(at('2026-11-12T16:00'))).toBe(1);
    expect(db.orders).toHaveLength(1);
    expect(db.items.map((i) => i.ingredientId)).toEqual(['rice']);
  });

  it('skips an ingredient already on an open order, and one without a supplier', async () => {
    db.ingredients[0].emergencyLevel = D(5);
    db.ingredients.push(ingredient('salt', 0, { supplierId: null, emergencyLevel: D(1) }));
    db.orders.push({ id: 'sent', supplierId: 's1', status: 'SENT', source: 'MANUAL', orderDay: null });
    db.items.push({ purchaseOrderId: 'sent', ingredientId: 'rice', packs: 5 });
    expect(await checkUrgent(at('2026-11-12T14:00'))).toBe(0);
    expect(db.orders).toHaveLength(1);
    expect(db.ingredients.find((i) => i.id === 'salt')!.urgentSince).toBeInstanceOf(Date); // still counted as urgent (bell, 3f)
  });
});
