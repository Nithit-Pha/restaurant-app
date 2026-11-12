import { Prisma } from '@prisma/client';
import { prisma } from '../../config/db';
import { env } from '../../config/env';
import { businessDate } from '../../utils/businessTime';
import { getOpenStatus } from '../settings/settings.service';
import { itemsInclude, nextOrderNumber, priceItems, type CartItemInput } from '../orders/orders.service';
import { syncTableStatus } from './tableStatus';
import { readVisitKey, signVisitKey } from './visitKey';
import { publish } from '../../utils/events';
import { getFloor } from '../tables/tables.service';

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

/**
 * Where a guest's visit lives now: staff may have merged it into another
 * table's visit (a big group at joined tables). Returns the id of the visit
 * at the end of that chain.
 */
async function followMerges(db: Prisma.TransactionClient | typeof prisma, id: string): Promise<string> {
  let current = id;
  for (let i = 0; i < 10; i++) {
    const v = await db.tableSession.findUnique({ where: { id: current }, select: { mergedIntoId: true } });
    if (!v?.mergedIntoId) return current;
    current = v.mergedIntoId;
  }
  return current;
}

/** The guest's visit from their key: 401 without a valid key, 410 once it is paid and closed. */
export async function getVisitByKey(key: string | undefined) {
  const id = readVisitKey(key);
  if (!id) throw httpError(401, 'Please scan the QR code on your table again.');
  const visit = await loadVisit(await followMerges(prisma, id));
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
    // The guest's own visit first (even after staff moved or merged it), then the table's open visit.
    let visit = wanted
      ? await tx.tableSession.findFirst({ where: { id: await followMerges(tx, wanted), closedAt: null }, select: { id: true } })
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
  publish({ type: 'order', orderId: visit.orders[visit.orders.length - 1]?.id ?? '', tableId: await tableIdOf(visitId) });
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
  publish({ type: 'table', tableId: await tableIdOf(visit.id) });
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
  publish({ type: 'table', tableId: await tableIdOf(id) });
  return visitSummary((await loadVisit(id))!);
}

async function tableIdOf(visitId: string) {
  const v = await prisma.tableSession.findUnique({ where: { id: visitId }, select: { tableId: true } });
  return v?.tableId ?? null;
}

// ------------------------------------------------------------- floor view --

/** A visit as the floor view shows it on a table. */
function visitBrief(v: Prisma.TableSessionGetPayload<{ include: { orders: { select: { status: true; total: true } } } }>) {
  const live = v.orders.filter((o) => o.status !== 'CANCELLED');
  const count = (s: string) => live.filter((o) => o.status === s).length;
  return {
    id: v.id,
    tableId: v.tableId,
    guests: v.guests,
    confirmed: Boolean(v.confirmedAt),
    openedAt: v.openedAt,
    staffCalledAt: v.staffCalledAt,
    billRequestedAt: v.billRequestedAt,
    total: round2(live.reduce((s, o) => s + Number(o.total), 0)),
    orders: { waiting: count('PENDING'), cooking: count('PREPARING'), ready: count('READY'), served: count('DELIVERED') },
  };
}

/** Zones, tables (with live status) and every open visit, for the staff floor view. */
export async function getFloorView() {
  const [zones, visits] = await Promise.all([
    getFloor(),
    prisma.tableSession.findMany({
      where: { closedAt: null, tableId: { not: null } },
      include: { orders: { select: { status: true, total: true } } },
    }),
  ]);
  return { zones, visits: visits.map(visitBrief) };
}

/** One open visit with every round, for the side panel of the floor view. */
export async function getVisitForStaff(id: string) {
  const visit = await loadVisit(id);
  if (!visit) throw httpError(404, 'Visit not found');
  return visitSummary(visit);
}

/** Lock the table rows (in id order, so two staff never deadlock). */
async function lockTables(tx: Prisma.TransactionClient, ids: string[]) {
  for (const id of [...ids].sort()) {
    await tx.$queryRaw`SELECT "id" FROM "DiningTable" WHERE "id" = ${id} FOR UPDATE`;
  }
}

async function activeTable(tx: Prisma.TransactionClient, id: string) {
  const table = await tx.diningTable.findUnique({ where: { id }, select: { id: true, label: true, isActive: true, zone: { select: { name: true } } } });
  if (!table || !table.isActive) throw httpError(404, 'Table not found');
  return table;
}

async function openVisitAt(tx: Prisma.TransactionClient, tableId: string) {
  return tx.tableSession.findFirst({ where: { tableId, closedAt: null }, select: { id: true } });
}

/** Staff seat guests at a free table (walk-ins who order with the waiter, or before they scan). */
export async function seatGuests(tableId: string, guests: number | undefined, staffId: string) {
  const visitId = await prisma.$transaction(async (tx) => {
    await lockTables(tx, [tableId]);
    const table = await activeTable(tx, tableId);
    if (await openVisitAt(tx, tableId)) throw httpError(409, `Table ${table.label} already has guests.`);
    const visit = await tx.tableSession.create({
      data: {
        tableId, tableLabel: table.label, zoneName: table.zone.name, guests,
        confirmedAt: new Date(), confirmedById: staffId,
      },
      select: { id: true },
    });
    await syncTableStatus(tx, visit.id);
    return visit.id;
  });
  publish({ type: 'table', tableId });
  return getVisitForStaff(visitId);
}

/** Guests change table: the visit (and its bill) moves along; the old table is free again. */
export async function moveVisit(visitId: string, toTableId: string) {
  const visit = await prisma.tableSession.findUnique({ where: { id: visitId }, select: { tableId: true, closedAt: true } });
  if (!visit || visit.closedAt) throw httpError(404, 'This visit is not open any more.');
  if (visit.tableId === toTableId) throw httpError(400, 'The guests are already at this table.');
  const fromTableId = visit.tableId;
  await prisma.$transaction(async (tx) => {
    await lockTables(tx, [toTableId, ...(fromTableId ? [fromTableId] : [])]);
    const target = await activeTable(tx, toTableId);
    if (await openVisitAt(tx, toTableId)) {
      throw httpError(409, `Table ${target.label} already has guests. Use "Merge" to put both on one bill.`);
    }
    await tx.tableSession.update({ where: { id: visitId }, data: { tableId: toTableId, tableLabel: target.label, zoneName: target.zone.name } });
    if (fromTableId) await tx.diningTable.update({ where: { id: fromTableId }, data: { status: 'FREE' } });
    await syncTableStatus(tx, visitId);
  });
  publish({ type: 'table', tableId: fromTableId });
  publish({ type: 'table', tableId: toTableId });
  return getVisitForStaff(visitId);
}

/**
 * Two tables become one bill (a big group): the orders of `fromVisitId` move
 * to `intoVisitId`, and the first visit is closed as merged. Guests' keys for
 * it keep working and now show the joint bill.
 */
export async function mergeVisits(fromVisitId: string, intoVisitId: string) {
  if (fromVisitId === intoVisitId) throw httpError(400, 'Pick another table to merge with.');
  const [from, into] = await Promise.all([
    prisma.tableSession.findUnique({ where: { id: fromVisitId }, select: { tableId: true, closedAt: true, guests: true } }),
    prisma.tableSession.findUnique({ where: { id: intoVisitId }, select: { tableId: true, closedAt: true, guests: true } }),
  ]);
  if (!from || from.closedAt || !into || into.closedAt) throw httpError(409, 'Both tables need an open visit to merge.');
  await prisma.$transaction(async (tx) => {
    await lockTables(tx, [from.tableId, into.tableId].filter((x): x is string => Boolean(x)));
    await tx.order.updateMany({ where: { tableSessionId: fromVisitId }, data: { tableSessionId: intoVisitId } });
    await tx.tableSession.update({ where: { id: fromVisitId }, data: { closedAt: new Date(), mergedIntoId: intoVisitId } });
    if (from.guests || into.guests) {
      await tx.tableSession.update({ where: { id: intoVisitId }, data: { guests: (from.guests ?? 0) + (into.guests ?? 0) } });
    }
    if (from.tableId) await tx.diningTable.update({ where: { id: from.tableId }, data: { status: 'FREE' } });
    await syncTableStatus(tx, intoVisitId);
  });
  publish({ type: 'table', tableId: from.tableId });
  publish({ type: 'table', tableId: into.tableId });
  return getVisitForStaff(intoVisitId);
}

/** The table is cleaned and ready for the next guests. */
export async function markCleaned(tableId: string) {
  const open = await prisma.tableSession.findFirst({ where: { tableId, closedAt: null }, select: { id: true } });
  if (open) throw httpError(409, 'This table still has guests.');
  await prisma.diningTable.update({ where: { id: tableId }, data: { status: 'FREE' } });
  publish({ type: 'table', tableId });
}
