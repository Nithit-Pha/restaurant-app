import { Prisma, type PurchaseOrderStatus } from '@prisma/client';
import { prisma } from '../../config/db';
import { env } from '../../config/env';
import { audit } from '../../utils/auditLog';
import { publish } from '../../utils/events';
import { ingredientsOnTheWay } from './automation';
import { businessDate } from '../../utils/businessTime';
import { canCancel, canEdit, expectedDelivery, formatPoNumber, sendProblem, suggestLines } from './purchasing.rules';
import type { CreatePoInput, PoLine, UpdatePoInput } from './purchasing.validation';

const httpError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

type Tx = Prisma.TransactionClient;

const detailInclude = {
  supplier: {
    select: {
      id: true, name: true, contactName: true, phone: true, lineId: true, email: true, address: true, note: true,
      isActive: true, leadTimeDays: true, cutOffTime: true, minOrder: true,
    },
  },
  items: { orderBy: { ingredientName: 'asc' } },
  createdBy: { select: { name: true } },
  sentBy: { select: { name: true } },
} satisfies Prisma.PurchaseOrderInclude;

const withLabel = <T extends { number: number }>(po: T) => ({ ...po, label: formatPoNumber(po.number) });

/** Orders, newest first, optionally only some statuses. */
export async function listPurchaseOrders(statuses?: PurchaseOrderStatus[]) {
  const rows = await prisma.purchaseOrder.findMany({
    where: statuses?.length ? { status: { in: statuses } } : {},
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { supplier: { select: { id: true, name: true } }, _count: { select: { items: true } } },
  });
  return rows.map(({ _count, ...po }) => withLabel({ ...po, lineCount: _count.items }));
}

export async function getPurchaseOrder(id: string) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: detailInclude });
  if (!po) throw httpError(404, 'Purchase order not found');
  return withLabel(po);
}

/** Copies name, unit and pack of each ingredient onto the lines. */
async function buildLines(tx: Tx, lines: PoLine[]) {
  if (lines.length === 0) return [];
  const ings = await tx.ingredient.findMany({
    where: { id: { in: lines.map((l) => l.ingredientId) } },
    select: { id: true, name: true, unit: true, packName: true, packSize: true, isActive: true },
  });
  const byId = new Map(ings.map((i) => [i.id, i]));
  return lines.map((l) => {
    const ing = byId.get(l.ingredientId);
    if (!ing) throw httpError(400, 'One of the ingredients does not exist any more. Reload the page.');
    if (!ing.isActive) throw httpError(400, `${ing.name} is switched off.`);
    return { ingredientId: ing.id, packs: l.packs, ingredientName: ing.name, unit: ing.unit, packName: ing.packName, packSize: ing.packSize };
  });
}

export async function createPurchaseOrder(input: CreatePoInput, actorId: string) {
  const supplier = await prisma.supplier.findUnique({
    where: { id: input.supplierId },
    include: { ingredients: { where: { isActive: true } } },
  });
  if (!supplier) throw httpError(404, 'Supplier not found');
  if (!supplier.isActive) throw httpError(400, 'That supplier is switched off.');
  const today = businessDate(new Date(), env.businessTimeZone);
  // Suggested: low ingredients that are not already on a sent order.
  const coming = input.items ? new Set<string>() : await ingredientsOnTheWay();
  const lines = input.items ?? suggestLines(supplier.ingredients.filter((i) => !coming.has(i.id)));

  const po = await prisma.$transaction(async (tx) => {
    const items = await buildLines(tx, lines);
    return tx.purchaseOrder.create({
      data: {
        supplierId: supplier.id,
        expectedDate: input.expectedDate === undefined ? expectedDelivery(today, supplier.leadTimeDays) : input.expectedDate,
        note: input.note ?? null,
        createdById: actorId,
        items: { create: items },
      },
      include: detailInclude,
    });
  });
  publish({ type: 'purchasing' });
  await audit({ actorId, action: 'CREATE', entityType: 'PURCHASE_ORDER', entityId: po.id, metadata: { number: formatPoNumber(po.number), supplier: supplier.name, lines: po.items.length } });
  return withLabel(po);
}

export async function updatePurchaseOrder(id: string, patch: UpdatePoInput, actorId: string) {
  const before = await prisma.purchaseOrder.findUnique({ where: { id }, select: { status: true, number: true } });
  if (!before) throw httpError(404, 'Purchase order not found');
  if (!canEdit(before.status)) throw httpError(409, 'Only a draft can be changed.');

  const po = await prisma.$transaction(async (tx) => {
    if (patch.items) {
      const items = await buildLines(tx, patch.items);
      await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
      if (items.length) await tx.purchaseOrderItem.createMany({ data: items.map((i) => ({ ...i, purchaseOrderId: id })) });
    }
    // Still a draft? (Someone may have sent it meanwhile.)
    const { count } = await tx.purchaseOrder.updateMany({
      where: { id, status: 'DRAFT' },
      data: {
        ...(patch.expectedDate !== undefined ? { expectedDate: patch.expectedDate } : {}),
        ...(patch.note !== undefined ? { note: patch.note } : {}),
      },
    });
    if (count === 0) throw httpError(409, 'Only a draft can be changed.');
    return tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: detailInclude });
  });
  publish({ type: 'purchasing' });
  await audit({ actorId, action: 'UPDATE', entityType: 'PURCHASE_ORDER', entityId: id, metadata: { number: formatPoNumber(before.number), changed: Object.keys(patch), lines: po.items.length } });
  return withLabel(po);
}

export async function sendPurchaseOrder(id: string, actorId: string) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, select: { status: true, number: true, items: { select: { packs: true } } } });
  if (!po) throw httpError(404, 'Purchase order not found');
  const problem = sendProblem(po);
  if (problem) throw httpError(409, problem);
  const { count } = await prisma.purchaseOrder.updateMany({
    where: { id, status: 'DRAFT' },
    data: { status: 'SENT', sentAt: new Date(), sentById: actorId },
  });
  if (count === 0) throw httpError(409, 'Only a draft can be sent.');
  publish({ type: 'purchasing' });
  await audit({ actorId, action: 'STATUS_CHANGE', entityType: 'PURCHASE_ORDER', entityId: id, metadata: { number: formatPoNumber(po.number), from: 'DRAFT', to: 'SENT' } });
  return getPurchaseOrder(id);
}

export async function cancelPurchaseOrder(id: string, actorId: string) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, select: { status: true, number: true } });
  if (!po) throw httpError(404, 'Purchase order not found');
  if (!canCancel(po.status)) throw httpError(409, 'This order can no longer be cancelled.');
  const { count } = await prisma.purchaseOrder.updateMany({
    where: { id, status: { in: ['DRAFT', 'SENT'] } },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  });
  if (count === 0) throw httpError(409, 'This order can no longer be cancelled.');
  publish({ type: 'purchasing' });
  await audit({ actorId, action: 'STATUS_CHANGE', entityType: 'PURCHASE_ORDER', entityId: id, metadata: { number: formatPoNumber(po.number), from: po.status, to: 'CANCELLED' } });
  return getPurchaseOrder(id);
}
