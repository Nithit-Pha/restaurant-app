import { describe, it, expect, vi, beforeEach } from 'vitest';

const { prismaMock, tx, openStatus, syncMock } = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    tableSession: { findFirst: vi.fn(), findUnique: vi.fn(async () => ({ mergedIntoId: null })), create: vi.fn(), update: vi.fn() },
    order: { create: vi.fn(), updateMany: vi.fn() },
    diningTable: { findUnique: vi.fn(), update: vi.fn() },
  };
  return {
    tx,
    prismaMock: {
      diningTable: { findUnique: vi.fn() },
      tableSession: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
      order: { findUnique: vi.fn() },
      $transaction: vi.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
    },
    openStatus: vi.fn(),
    syncMock: vi.fn(),
  };
});

vi.mock('../../config/db', () => ({ prisma: prismaMock }));
vi.mock('../settings/settings.service', () => ({ getOpenStatus: openStatus }));
vi.mock('./tableStatus', () => ({ syncTableStatus: syncMock }));
vi.mock('../orders/orders.service', () => ({
  itemsInclude: { include: { modifiers: { orderBy: { position: 'asc' } } } },
  nextOrderNumber: vi.fn(async () => 7),
  priceItems: vi.fn(async () => ({
    lines: [{ menuItemId: 'm1', nameSnapshot: 'Pad Thai', unitPrice: 80, unitCost: 30, quantity: 2, note: null, options: [] }],
    pricing: { subtotal: 149.53, taxRate: 0.07, taxAmount: 10.47, total: 160, totalCost: 60, profit: 89.53 },
  })),
}));

vi.mock('../tables/tables.service', () => ({ getFloor: vi.fn(async () => []) }));
const { publishMock } = vi.hoisted(() => ({ publishMock: vi.fn() }));
vi.mock('../../utils/events', () => ({ publish: publishMock }));

import {
  getVisitByKey, guestRequest, joinVisit, mergeVisits, moveVisit, placeTableOrder, seatGuests, visitSummary,
} from './dineIn.service';
import { readVisitKey, signVisitKey } from './visitKey';

const TABLE = { id: 'table-4', label: 'T4', isActive: true, zone: { name: 'Indoor' } };
const visitRow = (over: Record<string, unknown> = {}) => ({
  id: 'visit-1', tableLabel: 'T4', zoneName: 'Indoor', guests: null, confirmedAt: null, openedAt: new Date(),
  staffCalledAt: null, billRequestedAt: null, closedAt: null, orders: [], ...over,
});
const ITEMS = { items: [{ menuItemId: '11111111-1111-4111-8111-111111111111', quantity: 2, modifierIds: [] }] };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.diningTable.findUnique.mockResolvedValue(TABLE);
  openStatus.mockResolvedValue({ isOpen: true });
  prismaMock.tableSession.findUnique.mockImplementation(async ({ where }: any) => visitRow({ id: where.id }));
  tx.tableSession.create.mockResolvedValue({ id: 'visit-new' });
  tx.order.create.mockResolvedValue({ id: 'order-1' });
});

describe('guest opens the table page', () => {
  it('gets no key while the table has no visit: opening the page does not start one', async () => {
    prismaMock.tableSession.findFirst.mockResolvedValue(null);
    const res = await joinVisit('qr-abc');
    expect(res).toMatchObject({ table: { label: 'T4', zoneName: 'Indoor' }, key: null, visit: null });
  });

  it('joins the open visit (friends already ordered) and gets its key', async () => {
    prismaMock.tableSession.findFirst.mockResolvedValue(visitRow());
    const res = await joinVisit('qr-abc');
    expect(readVisitKey(res.key)).toBe('visit-1');
    expect(prismaMock.tableSession.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { tableId: 'table-4', closedAt: null } }));
  });

  it('gets 404 for an unknown or switched-off QR code', async () => {
    prismaMock.diningTable.findUnique.mockResolvedValue(null);
    await expect(joinVisit('qr-old')).rejects.toMatchObject({ statusCode: 404 });
    prismaMock.diningTable.findUnique.mockResolvedValue({ ...TABLE, isActive: false });
    await expect(joinVisit('qr-abc')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('guest orders from the table', () => {
  it('starts a visit with the first order: dine-in, no customer, waiting for staff', async () => {
    tx.tableSession.findFirst.mockResolvedValue(null);
    const res = await placeTableOrder('qr-abc', undefined, ITEMS);

    expect(tx.$queryRaw).toHaveBeenCalled(); // table row locked: two phones cannot open two visits
    expect(tx.tableSession.create).toHaveBeenCalledWith(expect.objectContaining({ data: { tableId: 'table-4', tableLabel: 'T4', zoneName: 'Indoor' } }));
    const data = tx.order.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ type: 'DINE_IN', tableSessionId: 'visit-new', orderNumber: 7, total: 160, deliveryFee: 0 });
    expect(data.userId).toBeUndefined();
    expect(data.statusHistory).toEqual({ create: { toStatus: 'PENDING' } });
    expect(syncMock).toHaveBeenCalledWith(tx, 'visit-new');
    expect(res.created).toBe(true);
    expect(readVisitKey(res.key)).toBe('visit-new');
  });

  it('adds a second round to the same visit with the guest\'s key', async () => {
    tx.tableSession.findFirst.mockResolvedValueOnce({ id: 'visit-1' });
    await placeTableOrder('qr-abc', signVisitKey('visit-1'), ITEMS);
    expect(tx.tableSession.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'visit-1', closedAt: null } }));
    expect(tx.tableSession.create).not.toHaveBeenCalled();
    expect(tx.order.create.mock.calls[0][0].data.tableSessionId).toBe('visit-1');
  });

  it('a key from a paid (closed) visit does not reach the old bill: a new visit starts', async () => {
    tx.tableSession.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    await placeTableOrder('qr-abc', signVisitKey('visit-old'), ITEMS);
    expect(tx.order.create.mock.calls[0][0].data.tableSessionId).toBe('visit-new');
  });

  it('a new phone at an occupied table joins the open visit', async () => {
    tx.tableSession.findFirst.mockResolvedValueOnce({ id: 'visit-1' });
    await placeTableOrder('qr-abc', undefined, ITEMS);
    expect(tx.order.create.mock.calls[0][0].data.tableSessionId).toBe('visit-1');
  });

  it('is refused while the restaurant is closed or paused (409)', async () => {
    openStatus.mockResolvedValue({ isOpen: false, closedReason: 'PAUSED', pauseMessage: 'Back in 20 minutes' });
    await expect(placeTableOrder('qr-abc', undefined, ITEMS)).rejects.toMatchObject({ statusCode: 409, message: 'Back in 20 minutes' });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('a retry with the same order key returns the visit without a second order', async () => {
    prismaMock.order.findUnique.mockResolvedValue({ tableSession: { id: 'visit-1', tableId: 'table-4' } });
    const res = await placeTableOrder('qr-abc', undefined, { ...ITEMS, idempotencyKey: '22222222-2222-4222-8222-222222222222' });
    expect(res.created).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe('the guest\'s visit', () => {
  it('needs a valid key (401) and ends when paid (410)', async () => {
    await expect(getVisitByKey(undefined)).rejects.toMatchObject({ statusCode: 401 });
    prismaMock.tableSession.findUnique.mockResolvedValue(visitRow({ closedAt: new Date() }));
    await expect(getVisitByKey(signVisitKey('visit-1'))).rejects.toMatchObject({ statusCode: 410 });
  });

  it('asks for the bill once and updates the table status', async () => {
    await guestRequest(signVisitKey('visit-1'), 'REQUEST_BILL');
    expect(tx.tableSession.update).toHaveBeenCalledWith({ where: { id: 'visit-1' }, data: { billRequestedAt: expect.any(Date) } });
    expect(syncMock).toHaveBeenCalled();
  });

  it('adds up every round except cancelled ones, without cost or profit', () => {
    const order = (status: string, total: number) => ({
      id: status, orderNumber: 1, status, createdAt: new Date(), subtotal: total / 1.07, taxAmount: total - total / 1.07, total,
      items: [{ id: 'i', nameSnapshot: 'Pad Thai', menuItemId: 'm1', quantity: 1, unitPrice: total, note: null, modifiers: [] }],
    });
    const summary = visitSummary(visitRow({ orders: [order('DELIVERED', 160), order('CANCELLED', 50), order('PREPARING', 80)] }) as any);
    expect(summary.totals.total).toBe(240);
    expect(JSON.stringify(summary)).not.toMatch(/cost|profit/i);
  });
});

describe('staff at the table', () => {
  beforeEach(() => {
    tx.diningTable.findUnique.mockImplementation(async ({ where }: any) => ({ id: where.id, label: where.id.toUpperCase(), isActive: true, zone: { name: 'Indoor' } }));
  });

  it('seat guests at a free table: a confirmed visit, and the floor view hears about it', async () => {
    tx.tableSession.findFirst.mockResolvedValue(null);
    tx.tableSession.create.mockResolvedValue({ id: 'visit-9' });
    await seatGuests('t5', 4, 'staff-1');
    expect(tx.tableSession.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tableId: 't5', tableLabel: 'T5', guests: 4, confirmedById: 'staff-1', confirmedAt: expect.any(Date) }),
    }));
    expect(publishMock).toHaveBeenCalledWith({ type: 'table', tableId: 't5' });
  });

  it('will not seat guests at a table that already has a visit (409)', async () => {
    tx.tableSession.findFirst.mockResolvedValue({ id: 'visit-1' });
    await expect(seatGuests('t5', 2, 'staff-1')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('moves a visit to a free table; the old table is free again', async () => {
    prismaMock.tableSession.findUnique.mockImplementation(async ({ where }: any) =>
      (where.id === 'visit-1' ? { ...visitRow(), tableId: 't4' } : visitRow({ id: where.id })));
    tx.tableSession.findFirst.mockResolvedValue(null);
    await moveVisit('visit-1', 't6');
    expect(tx.tableSession.update).toHaveBeenCalledWith({ where: { id: 'visit-1' }, data: { tableId: 't6', tableLabel: 'T6', zoneName: 'Indoor' } });
    expect(tx.diningTable.update).toHaveBeenCalledWith({ where: { id: 't4' }, data: { status: 'FREE' } });
  });

  it('will not move onto a table with guests: that is a merge (409)', async () => {
    prismaMock.tableSession.findUnique.mockResolvedValue({ ...visitRow(), tableId: 't4' });
    tx.tableSession.findFirst.mockResolvedValue({ id: 'visit-2' });
    await expect(moveVisit('visit-1', 't6')).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('Merge') });
  });

  it('merges two visits into one bill: orders move, the first visit closes as merged', async () => {
    prismaMock.tableSession.findUnique.mockImplementation(async ({ where, include }: any) => (include
      ? visitRow({ id: where.id }) // the joint bill that is returned
      : where.id === 'visit-a' ? { tableId: 't4', closedAt: null, guests: 2 } : { tableId: 't5', closedAt: null, guests: 3 }));
    await mergeVisits('visit-a', 'visit-b');
    expect(tx.order.updateMany).toHaveBeenCalledWith({ where: { tableSessionId: 'visit-a' }, data: { tableSessionId: 'visit-b' } });
    expect(tx.tableSession.update).toHaveBeenCalledWith({ where: { id: 'visit-a' }, data: { closedAt: expect.any(Date), mergedIntoId: 'visit-b' } });
    expect(tx.tableSession.update).toHaveBeenCalledWith({ where: { id: 'visit-b' }, data: { guests: 5 } });
    expect(tx.diningTable.update).toHaveBeenCalledWith({ where: { id: 't4' }, data: { status: 'FREE' } });
  });

  it('a guest whose visit was merged sees the joint bill (their key follows the merge)', async () => {
    prismaMock.tableSession.findUnique.mockImplementation(async ({ where, select }: any) => {
      if (select?.mergedIntoId) return { mergedIntoId: where.id === 'visit-a' ? 'visit-b' : null };
      return visitRow({ id: where.id, tableLabel: where.id === 'visit-b' ? 'T5' : 'T4' });
    });
    const visit = await getVisitByKey(signVisitKey('visit-a'));
    expect(visit.id).toBe('visit-b');
  });
});
