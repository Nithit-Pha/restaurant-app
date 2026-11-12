import { Prisma } from '@prisma/client';
import { prisma } from '../../config/db';
import { env } from '../../config/env';
import { businessDate } from '../../utils/businessTime';
import { getOpenStatus } from '../settings/settings.service';
import { itemsInclude, nextOrderNumber, priceItems, type CartItemInput } from '../orders/orders.service';
import { syncTableStatus } from './tableStatus';
import { readVisitKey, signVisitKey } from './visitKey';

const httpError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface TableOrderInput {
  items: CartItemInput[];
  idempotencyKey?: string;
}

/** The active table behind a QR code, or 404 for an unknown or replaced code. */
async function findTable(qrToken: string) {
  const table = await prisma.diningTable.findUnique({
    where: { qrToken },
    select: { id: true, label: true, isActive: true, zone: { select: { name: true } } },
  });
  if (!table || !table.isActive) {
    throw httpError(404, 'This QR code is not valid any more. Please ask the staff for help.');
  }
  return table;
}

const visitInclude = {
  orders: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true, orderNumber: true, status: true, createdAt: true,
      subtotal: true, taxAmount: true, total: true,
      items: { select: { id: true, nameSnapshot: true, menuItemId: true, quantity: true, unitPrice: true, note: true, modifiers: itemsInclude.include.modifiers } },
    },
  },
} satisfies Prisma.TableSessionInclude;

type VisitWithOrders = Prisma.TableSessionGetPayload<{ include: typeof visitInclude }>;

/**
 * What a guest (and later the bill) shows for a visit: every round of orders
 * and the running total. No cost or profit figures.
 */
export function visitSummary(v: VisitWithOrders) {
  const live = v.orders.filter((o) => o.status !== 'CANCELLED');
  const sum = (pick: (o: (typeof live)[number]) => Prisma.Decimal) => round2(live.reduce((s, o) => s + Number(pick(o)), 0));
  return {
    id: v.id,
    tableLabel: v.tableLabel,
    zoneName: v.zoneName,
    guests: v.guests,
    confirmed: Boolean(v.confirmedAt),
    openedAt: v.openedAt,
    staffCalledAt: v.staffCalledAt,
    billRequestedAt: v.billRequestedAt,
    closedAt: v.closedAt,
    orders: v.orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      createdAt: o.createdAt,
      total: Number(o.total),
      items: o.items.map((i) => ({
        id: i.id,
        name: i.nameSnapshot,
        menuItemId: i.menuItemId,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        note: i.note,
        options: i.modifiers.map((m) => ({ groupName: m.groupName, name: m.name, priceDelta: Number(m.priceDelta) })),
      })),
    })),
    totals: { subtotal: sum((o) => o.subtotal), taxAmount: sum((o) => o.taxAmount), total: sum((o) => o.total) },
  };
}

export type VisitSummary = ReturnType<typeof visitSummary>;

async function loadVisit(id: string) {
  return prisma.tableSession.findUnique({ where: { id }, include: visitInclude });
}

/** Table name for the guest page. */
export async function getTableForGuest(qrToken: string) {
  const table = await findTable(qrToken);
  return { label: table.label, zoneName: table.zone.name };
}

/**
 * A guest opens the table's page. When the table already has an open visit
 * (friends ordered already), they get its key and see its orders. Opening the
 * page alone never starts a visit: the first order does.
 */
export async function joinVisit(qrToken: string) {
  const table = await findTable(qrToken);
  const visit = await prisma.tableSession.findFirst({
    where: { tableId: table.id, closedAt: null },
    orderBy: { openedAt: 'desc' },
    include: visitInclude,
  });
  return {
    table: { label: table.label, zoneName: table.zone.name },
    key: visit ? signVisitKey(visit.id) : null,
    visit: visit ? visitSummary(visit) : null,
  };
}

/** The guest's visit from their key: 401 without a valid key, 410 once it is paid and closed. */
export async function getVisitByKey(key: string | undefined) {
  const id = readVisitKey(key);
  if (!id) throw httpError(401, 'Please scan the QR code on your table again.');
  const visit = await loadVisit(id);
  if (!visit) throw httpError(401, 'Please scan the QR code on your table again.');
  if (visit.closedAt) throw httpError(410, 'This visit has ended. Thank you for coming!');
  return visit;
}

/**
 * A guest sends a round of dishes to the kitchen from the table's QR page.
 * Uses the visit in the guest's key when it is still open at this table;
 * otherwise joins the table's open visit, or starts a new one. The order
 * waits (PENDING) until staff accept it; accepting the first one also
 * confirms the visit.
 */
export async function placeTableOrder(qrToken: string, key: string | undefined, input: TableOrderInput) {
  const table = await findTable(qrToken);

  if (input.idempotencyKey) {
    const existing = await prisma.order.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { tableSession: { select: { id: true, tableId: true } } },
    });
    if (existing) {
      if (existing.tableSession?.tableId !== table.id) {
        throw httpError(409, 'This order key belongs to another order. Please reload the page and try again.');
      }
      const visit = (await loadVisit(existing.tableSession.id))!;
      return { created: false, key: signVisitKey(visit.id), visit: visitSummary(visit) };
    }
  }

  const open = await getOpenStatus();
  if (!open.isOpen) {
    throw httpError(409, open.closedReason === 'PAUSED' ? open.pauseMessage : "Sorry, we're not taking orders right now.");
  }

  const { lines, pricing } = await priceItems(input.items);
  const day = businessDate(new Date(), env.businessTimeZone);
  const wanted = readVisitKey(key);

  const visitId = await prisma.$transaction(async (tx) => {
    // One guest at a time per table, so two phones cannot open two visits.
    await tx.$queryRaw`SELECT "id" FROM "DiningTable" WHERE "id" = ${table.id} FOR UPDATE`;
    let visit = wanted
      ? await tx.tableSession.findFirst({ where: { id: wanted, tableId: table.id, closedAt: null }, select: { id: true } })
      : null;
    visit ??= await tx.tableSession.findFirst({ where: { tableId: table.id, closedAt: null }, orderBy: { openedAt: 'desc' }, select: { id: true } });
    visit ??= await tx.tableSession.create({
      data: { tableId: table.id, tableLabel: table.label, zoneName: table.zone.name },
      select: { id: true },
    });

    const orderNumber = await nextOrderNumber(tx, day);
    await tx.order.create({
      data: {
        type: 'DINE_IN',
        tableSessionId: visit.id,
        orderNumber,
        businessDate: day,
        idempotencyKey: input.idempotencyKey,
        paymentMethod: 'CASH', // the bill is paid at the counter (cash or PromptPay), Step 1e
        subtotal: pricing.subtotal,
        taxRate: pricing.taxRate,
        taxAmount: pricing.taxAmount,
        deliveryFee: 0,
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
        statusHistory: { create: { toStatus: 'PENDING' } },
      },
    });
    await syncTableStatus(tx, visit.id);
    return visit.id;
  });

  const visit = (await loadVisit(visitId))!;
  return { created: true, key: signVisitKey(visitId), visit: visitSummary(visit) };
}

/** Guest presses "Call staff" or "Request bill". */
export async function guestRequest(key: string | undefined, what: 'CALL_STAFF' | 'REQUEST_BILL') {
  const visit = await getVisitByKey(key);
  await prisma.$transaction(async (tx) => {
    await tx.tableSession.update({
      where: { id: visit.id },
      data: what === 'CALL_STAFF' ? { staffCalledAt: new Date() } : { billRequestedAt: visit.billRequestedAt ?? new Date() },
    });
    if (what === 'REQUEST_BILL') await syncTableStatus(tx, visit.id);
  });
  return visitSummary((await loadVisit(visit.id))!);
}

/** Staff confirm that the guests are really at the table (and how many). */
export async function confirmVisit(id: string, staffId: string, guests?: number) {
  const visit = await prisma.tableSession.findUnique({ where: { id }, select: { closedAt: true, confirmedAt: true } });
  if (!visit) throw httpError(404, 'Visit not found');
  if (visit.closedAt) throw httpError(409, 'This visit is already closed.');
  await prisma.tableSession.update({
    where: { id },
    data: {
      ...(visit.confirmedAt ? {} : { confirmedAt: new Date(), confirmedById: staffId }),
      ...(guests !== undefined ? { guests } : {}),
      staffCalledAt: null,
    },
  });
  return visitSummary((await loadVisit(id))!);
}
