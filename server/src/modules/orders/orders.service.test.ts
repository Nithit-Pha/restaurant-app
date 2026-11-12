import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks -------------------------------------------------------------
// vi.hoisted runs before vi.mock factories, so these are safe to reference.
const { prismaMock, txOrderCreate, txQueryRaw, txUserUpdate, tx } = vi.hoisted(() => {
  const txOrderCreate = vi.fn();
  const txQueryRaw = vi.fn();
  const txUserUpdate = vi.fn();
  const tx = {
    order: { create: txOrderCreate, updateMany: vi.fn(), findUnique: vi.fn() },
    orderStatusHistory: { create: vi.fn() },
    payment: { create: vi.fn() },
    user: { update: txUserUpdate },
    tableSession: { update: vi.fn() },
    $queryRaw: txQueryRaw,
  };
  const prismaMock = {
    menuItem: { findMany: vi.fn() },
    order: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), aggregate: vi.fn() },
    tableSession: { findUnique: vi.fn(async () => ({ tableId: 'table-4' })) },
    $transaction: vi.fn(async (cb: (t: any) => any) => cb(tx)),
  };
  return { prismaMock, txOrderCreate, txQueryRaw, txUserUpdate, tx };
});

vi.mock('../../config/db', () => ({ prisma: prismaMock }));
const { syncTableStatus } = vi.hoisted(() => ({ syncTableStatus: vi.fn() }));
vi.mock('../dineIn/tableStatus', () => ({ syncTableStatus }));
// Key-aware: tax rate 0.07, and DELIVERY_MAX_KM = 0 (no limit) by default.
// Restaurant location used as the delivery origin (Springfield, IL).
const RESTAURANT_GEO = { latitude: 39.7817, longitude: -89.6501 };
vi.mock('../settings/settings.service', () => ({
  getSetting: vi.fn(async (key: string) => (key === 'DELIVERY_MAX_KM' ? 0 : 0.07)),
  getRestaurantProfile: vi.fn(async () => ({ geo: { latitude: 39.7817, longitude: -89.6501 } })),
  getOpenStatus: vi.fn(async () => ({ isOpen: true, enforced: true, nextOpening: null, timeZone: 'Asia/Bangkok' })),
  getPaymentSettings: vi.fn(async () => ({ promptPayId: '0812345678', promptPayName: 'Test Shop' })),
}));

// Keep real priceCart + haversineKm; stub only the async delivery-fee lookup.
vi.mock('../../utils/pricing', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return { ...actual, calcDeliveryFeeAsync: vi.fn(async () => 5.99) };
});

import { quoteOrder, placeOrder, changeOrderStatus, cancelByCustomer, changePayment, getPromptPayQr, getAllOrders } from './orders.service';
import { calcDeliveryFeeAsync } from '../../utils/pricing';
import { getSetting, getOpenStatus, getPaymentSettings } from '../settings/settings.service';

const MENU = [
  { id: 'burger', name: 'Burger', sellingPrice: 12.0, costPrice: 4.5, isAvailable: true },
  { id: 'fries', name: 'Fries', sellingPrice: 4.5, costPrice: 1.2, isAvailable: true },
];

const defaultSettings = async (key: string) => (key === 'DELIVERY_MAX_KM' ? 0 : 0.07);

beforeEach(() => {
  vi.clearAllMocks();
  (getSetting as any).mockImplementation(defaultSettings);
  prismaMock.menuItem.findMany.mockImplementation(async (args: any) => {
    const ids: string[] = args?.where?.id?.in ?? [];
    return MENU.filter((m) => ids.includes(m.id));
  });
  txOrderCreate.mockImplementation(async ({ data }: any) => ({ id: 'order-1', status: 'PENDING', ...data }));
  txQueryRaw.mockResolvedValue([{ value: 42 }]);
  prismaMock.order.findUnique.mockResolvedValue(null); // no earlier order with this idempotency key
  (getOpenStatus as any).mockResolvedValue({ isOpen: true, enforced: true, nextOpening: null, timeZone: 'Asia/Bangkok' });
});

describe('quoteOrder', () => {
  it('pickup: no delivery fee, correct subtotal/tax/profit', async () => {
    const q = await quoteOrder({
      type: 'PICKUP',
      items: [{ menuItemId: 'burger', quantity: 2 }, { menuItemId: 'fries', quantity: 1 }],
    });
    // gross 28.50 (tax-inclusive): tax = 28.5 * 0.07 / 1.07 = 1.86
    expect(q.subtotal).toBe(26.64);
    expect(q.totalCost).toBe(10.2);
    expect(q.taxAmount).toBe(1.86);
    expect(q.deliveryFee).toBe(0);
    expect(q.total).toBe(28.5);
    expect(q.profit).toBe(16.44);
    expect(calcDeliveryFeeAsync).not.toHaveBeenCalled();
  });

  it('delivery without coords: applies fee using the default distance', async () => {
    const q = await quoteOrder({
      type: 'DELIVERY',
      items: [{ menuItemId: 'burger', quantity: 1 }],
    });
    expect(calcDeliveryFeeAsync).toHaveBeenCalledWith(5);
    expect(q.deliveryFee).toBe(5.99);
    expect(q.total).toBe(17.99); // 12 (tax-inclusive) + 5.99 delivery; tax not added on top
  });

  it('delivery with coords: computes a positive haversine distance', async () => {
    await quoteOrder({
      type: 'DELIVERY',
      deliveryLat: 13.8,
      deliveryLng: 100.6,
      items: [{ menuItemId: 'burger', quantity: 1 }],
    });
    const distArg = (calcDeliveryFeeAsync as any).mock.calls[0][0];
    expect(distArg).toBeGreaterThan(0);
  });

  it('rejects delivery beyond the configured max distance', async () => {
    // 1 km limit; the coords below are far further than that.
    (getSetting as any).mockImplementation(async (k: string) => (k === 'DELIVERY_MAX_KM' ? 1 : 0.07));
    await expect(
      quoteOrder({
        type: 'DELIVERY',
        deliveryLat: 13.8,
        deliveryLng: 100.6,
        items: [{ menuItemId: 'burger', quantity: 1 }],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(calcDeliveryFeeAsync).not.toHaveBeenCalled();
  });

  it('measures distance from the restaurant profile location', async () => {
    // ~1 km north of the restaurant, with a 10 km limit -> allowed
    (getSetting as any).mockImplementation(async (k: string) => (k === 'DELIVERY_MAX_KM' ? 10 : 0.07));
    await quoteOrder({
      type: 'DELIVERY',
      deliveryLat: RESTAURANT_GEO.latitude + 0.009,
      deliveryLng: RESTAURANT_GEO.longitude,
      items: [{ menuItemId: 'burger', quantity: 1 }],
    });
    const distArg = (calcDeliveryFeeAsync as any).mock.calls[0][0];
    expect(distArg).toBeGreaterThan(0.9);
    expect(distArg).toBeLessThan(1.1);
  });

  it('requires a location when a max delivery distance is set', async () => {
    (getSetting as any).mockImplementation(async (k: string) => (k === 'DELIVERY_MAX_KM' ? 10 : 0.07));
    await expect(
      quoteOrder({ type: 'DELIVERY', deliveryAddress: 'somewhere', items: [{ menuItemId: 'burger', quantity: 1 }] }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(calcDeliveryFeeAsync).not.toHaveBeenCalled();
  });

  it('throws 400 when an item is unavailable', async () => {
    prismaMock.menuItem.findMany.mockResolvedValueOnce([]); // requested item not returned
    await expect(
      quoteOrder({ type: 'PICKUP', items: [{ menuItemId: 'fries', quantity: 1 }] }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('placeOrder', () => {
  it('rejects when any requested item is unavailable', async () => {
    prismaMock.menuItem.findMany.mockResolvedValueOnce([MENU[0]]); // only 1 of 2 returned
    await expect(
      placeOrder('user-1', {
        type: 'PICKUP',
        items: [{ menuItemId: 'burger', quantity: 1 }, { menuItemId: 'fries', quantity: 1 }],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('writes the order in a transaction with computed totals and line snapshots', async () => {
    const { order, created } = await placeOrder('user-1', {
      type: 'PICKUP',
      items: [{ menuItemId: 'burger', quantity: 2 }],
    });

    expect(created).toBe(true);
    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    const data = txOrderCreate.mock.calls[0][0].data;
    expect(data.userId).toBe('user-1');
    // gross 24.00: tax = 24 * 0.07 / 1.07 = 1.57
    expect(data.subtotal).toBe(22.43);
    expect(data.taxAmount).toBe(1.57);
    expect(data.total).toBe(24);
    expect(data.profit).toBe(13.43);

    const line = data.items.create[0];
    expect(line).toMatchObject({
      menuItemId: 'burger',
      nameSnapshot: 'Burger',
      unitPrice: 12,
      unitCost: 4.5,
      quantity: 2,
    });
    expect(order.id).toBe('order-1');
  });

  it('delivery order persists the address and a non-zero fee', async () => {
    const { order } = await placeOrder('user-1', {
      type: 'DELIVERY',
      deliveryAddress: '123 Main St',
      items: [{ menuItemId: 'fries', quantity: 1 }],
    });
    const data = txOrderCreate.mock.calls[0][0].data;
    expect(data.deliveryAddress).toBe('123 Main St');
    expect(data.deliveryFee).toBe(5.99);
    expect(order.deliveryFee).toBe(5.99);
  });
});

describe('placeOrder — Phase 0 rules', () => {
  const pickup = { type: 'PICKUP' as const, items: [{ menuItemId: 'burger', quantity: 1 }] };

  it('gives the order the next daily number and the business date', async () => {
    await placeOrder('user-1', pickup);
    const data = txOrderCreate.mock.calls[0][0].data;
    expect(txQueryRaw).toHaveBeenCalledOnce();
    expect(data.orderNumber).toBe(42);
    expect(data.businessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('records the first status in the history', async () => {
    await placeOrder('user-1', pickup);
    const data = txOrderCreate.mock.calls[0][0].data;
    expect(data.statusHistory.create).toMatchObject({ toStatus: 'PENDING', actorId: 'user-1' });
  });

  it('stores the phone on the order and on the customer profile', async () => {
    await placeOrder('user-1', { ...pickup, customerPhone: '081 234 5678' });
    expect(txOrderCreate.mock.calls[0][0].data.customerPhone).toBe('081 234 5678');
    expect(txUserUpdate).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { phone: '081 234 5678' } });
  });

  it('returns the existing order for a repeated idempotency key (no second order)', async () => {
    prismaMock.order.findUnique.mockResolvedValueOnce({ id: 'order-7', userId: 'user-1', items: [] });
    const { order, created } = await placeOrder('user-1', { ...pickup, idempotencyKey: '7b0e1c1e-3f6a-4d4b-9a51-1d2a3b4c5d6e' });
    expect(created).toBe(false);
    expect(order.id).toBe('order-7');
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("refuses another customer's idempotency key", async () => {
    prismaMock.order.findUnique.mockResolvedValueOnce({ id: 'order-7', userId: 'someone-else', items: [] });
    await expect(
      placeOrder('user-1', { ...pickup, idempotencyKey: '7b0e1c1e-3f6a-4d4b-9a51-1d2a3b4c5d6e' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('refuses orders while the restaurant is closed, saying when it opens', async () => {
    (getOpenStatus as any).mockResolvedValueOnce({
      isOpen: false, enforced: true, timeZone: 'Asia/Bangkok',
      nextOpening: { dayOfWeek: 'Monday', time: '11:00', inDays: 1 },
    });
    await expect(placeOrder('user-1', pickup)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('tomorrow at 11:00'),
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('refuses orders while staff have paused ordering, with their message', async () => {
    (getOpenStatus as any).mockResolvedValueOnce({
      isOpen: false, closedReason: 'PAUSED', pauseMessage: 'Kitchen is full, back in 20 minutes.',
      enforced: true, timeZone: 'Asia/Bangkok', nextOpening: null,
    });
    await expect(placeOrder('user-1', pickup)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Kitchen is full, back in 20 minutes.',
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe('changeOrderStatus', () => {
  beforeEach(() => {
    tx.order.updateMany.mockResolvedValue({ count: 1 });
    tx.order.findUnique.mockResolvedValue({ id: 'o1', status: 'PREPARING', items: [] });
  });

  it('accepts a pending order with a prep time and writes history', async () => {
    prismaMock.order.findUnique.mockResolvedValueOnce({ status: 'PENDING', type: 'PICKUP' });
    const { from } = await changeOrderStatus('o1', { to: 'PREPARING', actorId: 'staff-1', prepMinutes: 15 });
    expect(from).toBe('PENDING');
    const call = tx.order.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'o1', status: 'PENDING' }); // only if nobody moved it meanwhile
    expect(call.data.status).toBe('PREPARING');
    expect(call.data.estimatedReadyAt).toBeInstanceOf(Date);
    expect(tx.orderStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ orderId: 'o1', fromStatus: 'PENDING', toStatus: 'PREPARING', actorId: 'staff-1' }),
    });
  });

  it('accepting a dine-in order also confirms the table visit and updates the table', async () => {
    prismaMock.order.findUnique.mockResolvedValueOnce({ status: 'PENDING', type: 'DINE_IN', tableSessionId: 'visit-1', tableSession: { confirmedAt: null } });
    await changeOrderStatus('o1', { to: 'PREPARING', actorId: 'staff-1', prepMinutes: 10 });
    expect(tx.tableSession.update).toHaveBeenCalledWith({ where: { id: 'visit-1' }, data: { confirmedAt: expect.any(Date), confirmedById: 'staff-1' } });
    expect(syncTableStatus).toHaveBeenCalledWith(tx, 'visit-1');
  });

  it('serving a dine-in order (READY → DELIVERED) keeps the confirmation and updates the table', async () => {
    prismaMock.order.findUnique.mockResolvedValueOnce({ status: 'READY', type: 'DINE_IN', tableSessionId: 'visit-1', tableSession: { confirmedAt: new Date() } });
    await changeOrderStatus('o1', { to: 'DELIVERED', actorId: 'staff-1' });
    expect(tx.tableSession.update).not.toHaveBeenCalled();
    expect(syncTableStatus).toHaveBeenCalledWith(tx, 'visit-1');
  });

  it('rejects a move the workflow does not allow (409)', async () => {
    prismaMock.order.findUnique.mockResolvedValueOnce({ status: 'DELIVERED', type: 'PICKUP' });
    await expect(changeOrderStatus('o1', { to: 'PREPARING', actorId: 's', prepMinutes: 10 }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('reports a conflict when someone else moved the order first', async () => {
    prismaMock.order.findUnique.mockResolvedValueOnce({ status: 'PENDING', type: 'PICKUP' });
    tx.order.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(changeOrderStatus('o1', { to: 'PREPARING', actorId: 's', prepMinutes: 10 }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(tx.orderStatusHistory.create).not.toHaveBeenCalled();
  });

  it('404s for an unknown order', async () => {
    prismaMock.order.findUnique.mockResolvedValueOnce(null);
    await expect(changeOrderStatus('nope', { to: 'READY', actorId: 's' })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('cancelByCustomer', () => {
  it('lets a customer cancel while the order is still pending', async () => {
    prismaMock.order.findFirst.mockResolvedValueOnce({ status: 'PENDING' });
    prismaMock.order.findUnique.mockResolvedValueOnce({ status: 'PENDING', type: 'PICKUP' });
    tx.order.updateMany.mockResolvedValueOnce({ count: 1 });
    tx.order.findUnique.mockResolvedValueOnce({ id: 'o1', status: 'CANCELLED', items: [] });
    await cancelByCustomer('o1', 'user-1');
    expect(tx.order.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'CANCELLED', cancelReason: 'CUSTOMER_REQUEST' });
  });

  it('refuses once the kitchen has accepted it', async () => {
    prismaMock.order.findFirst.mockResolvedValueOnce({ status: 'PREPARING' });
    await expect(cancelByCustomer('o1', 'user-1')).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('placeOrder — options and notes', () => {
  const BURGER_WITH_OPTIONS = {
    ...MENU[0],
    modifierGroups: [
      {
        id: 'g-size', name: 'Size', minSelect: 1, maxSelect: 1,
        modifiers: [
          { id: 'm-reg', name: 'Regular', priceDelta: '0.00', isAvailable: true },
          { id: 'm-lg', name: 'Large', priceDelta: '3.50', isAvailable: true },
        ],
      },
    ],
  };

  beforeEach(() => {
    prismaMock.menuItem.findMany.mockResolvedValue([BURGER_WITH_OPTIONS]);
  });

  it('prices the chosen options into the line and stores them with the note', async () => {
    await placeOrder('user-1', {
      type: 'PICKUP',
      items: [{ menuItemId: 'burger', quantity: 2, modifierIds: ['m-lg'], note: '  no onions ' }],
    });
    const data = txOrderCreate.mock.calls[0][0].data;
    const line = data.items.create[0];
    expect(line.unitPrice).toBe(15.5); // 12 + 3.50
    expect(line.unitCost).toBe(4.5); // options do not change the cost
    expect(line.note).toBe('no onions');
    expect(line.modifiers.create).toEqual([
      { modifierId: 'm-lg', groupName: 'Size', name: 'Large', priceDelta: 3.5, position: 0 },
    ]);
    expect(data.total).toBe(31); // 2 × 15.50
  });

  it('refuses a line that skips a required option (400)', async () => {
    await expect(placeOrder('user-1', { type: 'PICKUP', items: [{ menuItemId: 'burger', quantity: 1 }] }))
      .rejects.toMatchObject({ statusCode: 400, message: 'Please choose Size for Burger.' });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe('placeOrder — payment method', () => {
  const pickup = { type: 'PICKUP' as const, items: [{ menuItemId: 'burger', quantity: 1 }] };

  it('defaults to cash', async () => {
    await placeOrder('user-1', pickup);
    expect(txOrderCreate.mock.calls[0][0].data.paymentMethod).toBe('CASH');
  });

  it('stores PromptPay when the restaurant has set it up', async () => {
    await placeOrder('user-1', { ...pickup, paymentMethod: 'PROMPTPAY' });
    expect(txOrderCreate.mock.calls[0][0].data.paymentMethod).toBe('PROMPTPAY');
  });

  it('refuses PromptPay when no PromptPay ID is set', async () => {
    (getPaymentSettings as any).mockResolvedValueOnce({ promptPayId: '', promptPayName: '' });
    await expect(placeOrder('user-1', { ...pickup, paymentMethod: 'PROMPTPAY' })).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe('changePayment', () => {
  beforeEach(() => {
    tx.order.updateMany.mockResolvedValue({ count: 1 });
    tx.order.findUnique.mockResolvedValue({ id: 'o1', items: [] });
  });

  it('staff mark a cash order paid: conditional update, paidAt and a Payment row', async () => {
    prismaMock.order.findFirst.mockResolvedValueOnce({ status: 'DELIVERED', paymentMethod: 'CASH', paymentStatus: 'UNPAID', total: 120 });
    const { from, to } = await changePayment('o1', 'MARK_PAID', { actorId: 'staff-1', providerRef: ' ref-9 ' });
    expect([from, to]).toEqual(['UNPAID', 'PAID']);
    const call = tx.order.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'o1', paymentStatus: 'UNPAID' });
    expect(call.data.paidAt).toBeInstanceOf(Date);
    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ orderId: 'o1', method: 'CASH', status: 'PAID', amount: 120, providerRef: 'ref-9', confirmedById: 'staff-1' }),
    });
  });

  it('a customer reporting a transfer only moves it to PENDING, without a Payment row', async () => {
    prismaMock.order.findFirst.mockResolvedValueOnce({ status: 'PENDING', paymentMethod: 'PROMPTPAY', paymentStatus: 'UNPAID', total: 89 });
    const { to } = await changePayment('o1', 'CUSTOMER_SENT', { actorId: 'user-1', customerId: 'user-1' });
    expect(to).toBe('PENDING');
    expect(prismaMock.order.findFirst.mock.calls[0][0].where).toEqual({ id: 'o1', userId: 'user-1' }); // own order only
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('reports a conflict when someone else changed the payment first', async () => {
    prismaMock.order.findFirst.mockResolvedValueOnce({ status: 'READY', paymentMethod: 'CASH', paymentStatus: 'UNPAID', total: 50 });
    tx.order.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(changePayment('o1', 'MARK_PAID', { actorId: 's' })).rejects.toMatchObject({ statusCode: 409 });
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it("404s for an unknown order or another customer's order", async () => {
    prismaMock.order.findFirst.mockResolvedValueOnce(null);
    await expect(changePayment('o1', 'CUSTOMER_SENT', { actorId: 'u', customerId: 'u' })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('getPromptPayQr', () => {
  it('returns a payload with the order total for an unpaid PromptPay order', async () => {
    prismaMock.order.findFirst.mockResolvedValueOnce({ status: 'PENDING', paymentMethod: 'PROMPTPAY', paymentStatus: 'UNPAID', total: '120.00' });
    const qr = await getPromptPayQr('o1', 'user-1');
    expect(qr.amount).toBe(120);
    expect(qr.payload).toContain('5406120.00');
    expect(qr.promptPayName).toBe('Test Shop');
  });

  it('refuses for cash, paid or cancelled orders', async () => {
    for (const o of [
      { status: 'PENDING', paymentMethod: 'CASH', paymentStatus: 'UNPAID' },
      { status: 'PENDING', paymentMethod: 'PROMPTPAY', paymentStatus: 'PAID' },
      { status: 'CANCELLED', paymentMethod: 'PROMPTPAY', paymentStatus: 'UNPAID' },
    ]) {
      prismaMock.order.findFirst.mockResolvedValueOnce({ ...o, total: 10 });
      await expect(getPromptPayQr('o1')).rejects.toMatchObject({ statusCode: 409 });
    }
  });
});

describe('getAllOrders', () => {
  it('takes one status, or several for the kitchen', async () => {
    prismaMock.order.findMany.mockResolvedValue([]);
    await getAllOrders({ status: 'PENDING' });
    expect(prismaMock.order.findMany.mock.calls[0][0].where).toEqual({ status: 'PENDING' });
    await getAllOrders({ status: 'PENDING, PREPARING,READY' });
    expect(prismaMock.order.findMany.mock.calls[1][0].where).toEqual({ status: { in: ['PENDING', 'PREPARING', 'READY'] } });
    await getAllOrders({});
    expect(prismaMock.order.findMany.mock.calls[2][0].where).toEqual({});
  });
});
