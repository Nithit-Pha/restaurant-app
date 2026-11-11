import { Prisma } from '@prisma/client';
import { prisma } from '../../config/db';
import { env } from '../../config/env';
import { priceCart, calcDeliveryFeeAsync, haversineKm } from '../../utils/pricing';
import { businessDate, zonedDayRange } from '../../utils/businessTime';
import { getSetting, getRestaurantProfile, getOpenStatus, getPaymentSettings } from '../settings/settings.service';
import { planTransition, type CancelReason, type OrderStatus, type OrderType } from './orderStateMachine';
import { planPayment, type PaymentAction, type PaymentMethod, type PaymentStatus } from './paymentState';
import { buildPromptPayPayload } from '../../utils/promptpay';
import { priceLine } from './lineOptions';

// Distance assumed when the customer shares no location and no max delivery
// distance is configured.
const DEFAULT_DELIVERY_KM = 5;

interface CartItemInput {
  menuItemId: string;
  quantity: number;
  modifierIds?: string[]; // chosen options
  note?: string; // e.g. "no peanuts"
}

// Order lines always come with their chosen options, in display order.
const itemsInclude = { include: { modifiers: { orderBy: { position: 'asc' as const } } } };

interface CheckoutInput {
  items: CartItemInput[];
  type: 'PICKUP' | 'DELIVERY';
  deliveryAddress?: string;
  deliveryLat?: number;
  deliveryLng?: number;
}

interface PlaceOrderInput extends CheckoutInput {
  customerPhone?: string;
  idempotencyKey?: string;
  paymentMethod?: PaymentMethod;
}

const badRequest = (message: string) => Object.assign(new Error(message), { statusCode: 400 });
const httpError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

/** "We open again tomorrow at 11:00." style text for a closed restaurant. */
function closedMessage(next: { dayOfWeek: string; time: string; inDays: number } | null): string {
  if (!next) return "Sorry, we're closed and not taking orders right now.";
  const when = next.inDays === 0 ? 'today' : next.inDays === 1 ? 'tomorrow' : next.dayOfWeek;
  return `Sorry, we're closed right now. We open again ${when} at ${next.time}.`;
}

/** Next number for the business day, atomically (safe under concurrent checkouts). */
async function nextOrderNumber(tx: Prisma.TransactionClient, day: string): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "DailyCounter" ("date", "value") VALUES (${day}, 1)
    ON CONFLICT ("date") DO UPDATE SET "value" = "DailyCounter"."value" + 1
    RETURNING "value"`;
  return Number(rows[0].value);
}

/**
 * Look up the cart's menu items and snapshot their current price and cost.
 * Options are priced and checked here (lineOptions.ts); their price is part
 * of the line's unit price. Options do not change the cost.
 */
async function buildLines(items: CartItemInput[]) {
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: items.map((i) => i.menuItemId) }, isAvailable: true },
    include: {
      modifierGroups: {
        orderBy: { sortOrder: 'asc' },
        include: { modifiers: { orderBy: { sortOrder: 'asc' } } },
      },
    },
  });
  return items.map((item) => {
    const mi = menuItems.find((m) => m.id === item.menuItemId);
    if (!mi) throw badRequest('One or more items are unavailable');
    const { unitPrice, options } = priceLine(
      {
        name: mi.name,
        sellingPrice: Number(mi.sellingPrice),
        modifierGroups: (mi.modifierGroups ?? []).map((g) => ({
          ...g,
          modifiers: g.modifiers.map((m) => ({ ...m, priceDelta: Number(m.priceDelta) })),
        })),
      },
      item.modifierIds ?? [],
    );
    return {
      menuItemId: mi.id,
      nameSnapshot: mi.name,
      unitPrice,
      unitCost: Number(mi.costPrice),
      quantity: item.quantity,
      note: item.note?.trim() || null,
      options,
    };
  });
}

/**
 * Delivery fee. Distance is measured from the restaurant's own location
 * (Settings -> Restaurant profile -> latitude/longitude). When a max delivery
 * distance is set, the customer's location is required to enforce it.
 */
async function calcDelivery(input: CheckoutInput): Promise<number> {
  if (input.type !== 'DELIVERY') return 0;
  const maxKm = await getSetting('DELIVERY_MAX_KM');
  const hasCoords = input.deliveryLat != null && input.deliveryLng != null;

  if (!hasCoords) {
    if (maxKm > 0) {
      throw badRequest('Please share your location so we can check your address is within our delivery area.');
    }
    return calcDeliveryFeeAsync(DEFAULT_DELIVERY_KM);
  }

  const { geo } = await getRestaurantProfile();
  const distKm = haversineKm(geo.latitude, geo.longitude, input.deliveryLat!, input.deliveryLng!);
  if (maxKm > 0 && distKm > maxKm) {
    throw badRequest(`Sorry, this address is outside our delivery area (max ${maxKm} km).`);
  }
  return calcDeliveryFeeAsync(distKm);
}

/** One pricing path for both the checkout quote and the placed order. */
async function priceOrder(input: CheckoutInput) {
  const lines = await buildLines(input.items);
  const deliveryFee = await calcDelivery(input);
  const taxRate = await getSetting('TAX_RATE');
  return { lines, pricing: priceCart(lines, deliveryFee, taxRate) };
}

export async function quoteOrder(input: CheckoutInput) {
  const { pricing } = await priceOrder(input);
  return pricing;
}

/**
 * Place an order. Returns `created: false` when the idempotency key was
 * already used by this customer (a retry), with the original order.
 */
export async function placeOrder(userId: string, input: PlaceOrderInput) {
  if (input.idempotencyKey) {
    const existing = await findByIdempotencyKey(input.idempotencyKey, userId);
    if (existing) return { order: existing, created: false };
  }

  const open = await getOpenStatus();
  if (!open.isOpen) {
    throw httpError(409, open.closedReason === 'PAUSED' ? open.pauseMessage : closedMessage(open.nextOpening));
  }

  const paymentMethod = input.paymentMethod ?? 'CASH';
  if (paymentMethod === 'PROMPTPAY' && !(await getPaymentSettings()).promptPayId) {
    throw badRequest('PromptPay is not available right now. Please choose cash.');
  }

  const { lines, pricing } = await priceOrder(input);
  const now = new Date();
  const day = businessDate(now, env.businessTimeZone);

  try {
    const order = await prisma.$transaction(async (tx) => {
      const orderNumber = await nextOrderNumber(tx, day);
      if (input.customerPhone) {
        await tx.user.update({ where: { id: userId }, data: { phone: input.customerPhone } });
      }
      return tx.order.create({
        data: {
          userId,
          type: input.type,
          orderNumber,
          businessDate: day,
          idempotencyKey: input.idempotencyKey,
          customerPhone: input.customerPhone,
          paymentMethod,
          deliveryAddress: input.deliveryAddress,
          deliveryLat: input.deliveryLat,
          deliveryLng: input.deliveryLng,
          subtotal: pricing.subtotal,
          taxRate: pricing.taxRate,
          taxAmount: pricing.taxAmount,
          deliveryFee: pricing.deliveryFee,
          total: pricing.total,
          totalCost: pricing.totalCost,
          profit: pricing.profit,
          items: {
            create: lines.map((l) => ({
              menuItemId: l.menuItemId,
              nameSnapshot: l.nameSnapshot,
              unitPrice: l.unitPrice,
              unitCost: l.unitCost,
              quantity: l.quantity,
              note: l.note,
              ...(l.options.length ? { modifiers: { create: l.options } } : {}),
            })),
          },
          statusHistory: { create: { toStatus: 'PENDING', actorId: userId } },
        },
        include: { items: itemsInclude },
      });
    });
    return { order, created: true };
  } catch (err) {
    // Two identical requests raced past the first check: return the winner.
    if (input.idempotencyKey && (err as { code?: string }).code === 'P2002') {
      const existing = await findByIdempotencyKey(input.idempotencyKey, userId);
      if (existing) return { order: existing, created: false };
    }
    throw err;
  }
}

async function findByIdempotencyKey(key: string, userId: string) {
  const existing = await prisma.order.findUnique({ where: { idempotencyKey: key }, include: { items: itemsInclude } });
  if (existing && existing.userId !== userId) {
    throw httpError(409, 'This checkout key belongs to another order. Please reload the page and try again.');
  }
  return existing;
}

export async function getUserOrders(userId: string) {
  return prisma.order.findMany({
    where: { userId },
    include: { items: itemsInclude },
    orderBy: { createdAt: 'desc' },
  });
}

const historyInclude = {
  orderBy: { createdAt: 'asc' as const },
  select: { fromStatus: true, toStatus: true, note: true, createdAt: true, actor: { select: { name: true, role: true } } },
};

const paymentsInclude = {
  orderBy: { createdAt: 'asc' as const },
  select: {
    method: true, status: true, amount: true, providerRef: true, note: true, createdAt: true,
    confirmedBy: { select: { name: true } },
  },
};

/** One order. `userId` limits it to that customer's own orders. Staff also get history and payments. */
export async function getOrderById(id: string, userId?: string, withHistory = false) {
  return prisma.order.findFirst({
    where: { id, ...(userId ? { userId } : {}) },
    include: { items: itemsInclude, ...(withHistory ? { statusHistory: historyInclude, payments: paymentsInclude } : {}) },
  });
}

export interface AdminOrderFilter {
  status?: string;
  date?: string; // 'YYYY-MM-DD' business day
  limit?: number;
}

/** Staff order list: filtered on the server, newest first, capped. */
export async function getAllOrders({ status, date, limit = 200 }: AdminOrderFilter = {}) {
  const range = date ? zonedDayRange(date, env.businessTimeZone) : null;
  return prisma.order.findMany({
    where: {
      ...(status ? { status: status as OrderStatus } : {}),
      ...(range ? { createdAt: { gte: range.start, lte: range.end } } : {}),
    },
    include: {
      user: { select: { id: true, name: true, username: true, email: true, phone: true } },
      items: itemsInclude,
      statusHistory: historyInclude,
      payments: paymentsInclude,
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 500),
  });
}

export interface StatusChange {
  to: OrderStatus;
  actorId: string;
  prepMinutes?: number;
  cancelReason?: CancelReason;
  cancelNote?: string;
}

/**
 * Move an order to its next status through the state machine. The update only
 * applies if the status is still what we read, so two people clicking at the
 * same time cannot both move it.
 */
export async function changeOrderStatus(id: string, change: StatusChange) {
  const order = await prisma.order.findUnique({ where: { id }, select: { status: true, type: true } });
  if (!order) throw httpError(404, 'Order not found');

  const data = planTransition(
    { status: order.status as OrderStatus, type: order.type as OrderType },
    { ...change },
  );

  return prisma.$transaction(async (tx) => {
    const res = await tx.order.updateMany({ where: { id, status: order.status }, data });
    if (res.count === 0) {
      throw httpError(409, 'This order was just updated by someone else. Refresh and try again.');
    }
    await tx.orderStatusHistory.create({
      data: {
        orderId: id,
        fromStatus: order.status,
        toStatus: change.to,
        actorId: change.actorId,
        note: change.cancelNote?.trim() || null,
      },
    });
    const updated = await tx.order.findUnique({ where: { id }, include: { items: itemsInclude } });
    return { from: order.status as OrderStatus, order: updated! };
  });
}

/** A customer cancels their own order; only possible while it is still PENDING. */
export async function cancelByCustomer(id: string, userId: string, note?: string) {
  const order = await prisma.order.findFirst({ where: { id, userId }, select: { status: true } });
  if (!order) throw httpError(404, 'Order not found');
  if (order.status !== 'PENDING') {
    throw httpError(409, 'The restaurant has already started on this order. Please call us to cancel.');
  }
  return changeOrderStatus(id, { to: 'CANCELLED', actorId: userId, cancelReason: 'CUSTOMER_REQUEST', cancelNote: note });
}

export interface PaymentChange {
  actorId: string;
  customerId?: string; // set when a customer acts: limits it to their own order
  providerRef?: string;
  note?: string;
}

/**
 * Move an order's payment through the payment rules (paymentState.ts). Like
 * status changes, the update only applies if the payment status is still what
 * we read. PAID and REFUNDED also write a Payment row.
 */
export async function changePayment(id: string, action: PaymentAction, change: PaymentChange) {
  const order = await prisma.order.findFirst({
    where: { id, ...(change.customerId ? { userId: change.customerId } : {}) },
    select: { status: true, paymentMethod: true, paymentStatus: true, total: true },
  });
  if (!order) throw httpError(404, 'Order not found');

  const from = order.paymentStatus as PaymentStatus;
  const to = planPayment(
    { status: order.status, paymentMethod: order.paymentMethod as PaymentMethod, paymentStatus: from },
    action,
  );

  return prisma.$transaction(async (tx) => {
    const res = await tx.order.updateMany({
      where: { id, paymentStatus: from },
      data: { paymentStatus: to, ...(to === 'PAID' ? { paidAt: new Date() } : {}) },
    });
    if (res.count === 0) {
      throw httpError(409, 'This payment was just updated by someone else. Refresh and try again.');
    }
    if (to === 'PAID' || to === 'REFUNDED') {
      await tx.payment.create({
        data: {
          orderId: id,
          method: order.paymentMethod,
          status: to,
          amount: order.total,
          providerRef: change.providerRef?.trim() || null,
          note: change.note?.trim() || null,
          confirmedById: change.actorId,
        },
      });
    }
    const updated = await tx.order.findUnique({
      where: { id },
      include: { items: itemsInclude, ...(change.customerId ? {} : { payments: paymentsInclude }) },
    });
    return { from, to, order: updated! };
  });
}

/**
 * What the customer scans to pay: a PromptPay QR payload with the order total.
 * Only while a PromptPay order is still waiting for its payment.
 */
export async function getPromptPayQr(id: string, userId?: string) {
  const order = await prisma.order.findFirst({
    where: { id, ...(userId ? { userId } : {}) },
    select: { status: true, paymentMethod: true, paymentStatus: true, total: true },
  });
  if (!order) throw httpError(404, 'Order not found');
  if (order.paymentMethod !== 'PROMPTPAY' || order.status === 'CANCELLED' ||
      !['UNPAID', 'PENDING'].includes(order.paymentStatus)) {
    throw httpError(409, 'There is nothing to pay by PromptPay for this order.');
  }
  const { promptPayId, promptPayName } = await getPaymentSettings();
  if (!promptPayId) throw httpError(409, 'PromptPay is not set up. Please pay the restaurant directly.');
  const amount = Number(order.total);
  return { payload: buildPromptPayPayload(promptPayId, amount), amount, promptPayName };
}

export async function getProfitReport(from?: Date, to?: Date) {
  return prisma.order.aggregate({
    where: {
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      ...(from || to ? { createdAt: { gte: from, lte: to } } : {}),
    },
    _sum: { subtotal: true, profit: true, total: true, taxAmount: true },
    _count: { id: true },
  });
}
