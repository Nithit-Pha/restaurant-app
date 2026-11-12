// Step 3d: deliveries of purchase orders. Staff record what arrived (stock
// goes up at once); the owner adds the prices, which makes one Finance
// "Food supply" expense per delivery.
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/db';
import { audit } from '../../utils/auditLog';
import { publish } from '../../utils/events';
import { stockInFromDelivery } from '../stock/stock.service';
import { notifyStockChanged } from '../stock/stock.notify';
import { formatPoNumber } from './purchasing.rules';
import { assertCan } from '../permissions/permissions.service';
import { getPurchaseOrder } from './purchasing.service';
import { canReceive, deliveryExpenseText, orderedAmount, packPrice, round2, statusAfterDeliveries } from './receiving.rules';
import type { PricesInput, ReceiveInput } from './receiving.validation';

const httpError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

type Tx = Prisma.TransactionClient;
interface Actor { userId: string; role: string }

const D = (x: number) => new Prisma.Decimal(x);

/** Works the order's status out again from all its deliveries. */
async function refreshStatus(tx: Tx, poId: string) {
  const items = await tx.purchaseOrderItem.findMany({
    where: { purchaseOrderId: poId },
    select: { packs: true, packSize: true, deliveryLines: { select: { amount: true } } },
  });
  const status = statusAfterDeliveries(items.map((i) => ({
    ordered: orderedAmount(i),
    received: i.deliveryLines.reduce((sum, l) => sum + Number(l.amount), 0),
  })));
  await tx.purchaseOrder.update({ where: { id: poId }, data: { status, receivedAt: status === 'RECEIVED' ? new Date() : null } });
  return status;
}

/**
 * Creates, changes or removes the delivery's expense so it matches the sum of
 * the line prices, and keeps each ingredient's last pack price.
 */
async function applyPrices(tx: Tx, deliveryId: string, actorId: string) {
  const d = await tx.purchaseDelivery.findUniqueOrThrow({
    where: { id: deliveryId },
    include: {
      lines: { include: { purchaseOrderItem: { select: { ingredientId: true, packSize: true } } } },
      purchaseOrder: { select: { number: true, supplier: { select: { name: true } }, deliveries: { select: { id: true }, orderBy: { receivedAt: 'asc' } } } },
    },
  });
  const priced = d.lines.filter((l) => l.price !== null);
  const total = round2(priced.reduce((sum, l) => sum + Number(l.price), 0));
  const deliveryNo = d.purchaseOrder.deliveries.findIndex((x) => x.id === d.id) + 1;
  const description = deliveryExpenseText(formatPoNumber(d.purchaseOrder.number), d.purchaseOrder.supplier.name, deliveryNo);

  let expenseId = d.expenseId;
  if (priced.length && total > 0) {
    if (expenseId) {
      await tx.expense.update({ where: { id: expenseId }, data: { amount: D(total), description } });
    } else {
      expenseId = (await tx.expense.create({
        data: { amount: D(total), category: 'FOOD_SUPPLY', date: d.receivedAt, description, createdById: actorId },
      })).id;
    }
  } else if (expenseId) {
    await tx.purchaseDelivery.update({ where: { id: d.id }, data: { expenseId: null } });
    await tx.expense.delete({ where: { id: expenseId } });
    expenseId = null;
  }
  await tx.purchaseDelivery.update({
    where: { id: d.id },
    data: priced.length
      ? { priceTotal: D(total), pricedById: actorId, pricedAt: new Date(), expenseId }
      : { priceTotal: null, pricedById: null, pricedAt: null, expenseId: null },
  });
  for (const l of priced) {
    const each = packPrice(l.price!, l.amount, l.purchaseOrderItem.packSize);
    if (each !== null) await tx.ingredient.update({ where: { id: l.purchaseOrderItem.ingredientId }, data: { lastPackPrice: D(each) } });
  }
  return total;
}

export async function receiveDelivery(poId: string, input: ReceiveInput, actor: Actor) {
  const pricesGiven = input.lines.some((l) => l.price !== undefined && l.price !== null);
  if (pricesGiven) await assertCan(actor, 'prices.enter', 'Only the owner can enter purchase prices.');

  const po = await prisma.purchaseOrder.findUnique({ where: { id: poId }, include: { items: true } });
  if (!po) throw httpError(404, 'Purchase order not found');
  if (!canReceive(po.status)) throw httpError(409, 'Only a sent order can take a delivery.');
  const items = new Map(po.items.map((i) => [i.id, i]));
  const lines = input.lines.filter((l) => l.amount > 0);
  for (const l of lines) if (!items.has(l.itemId)) throw httpError(400, 'A line is not on this order. Reload the page.');
  const label = formatPoNumber(po.number);

  const { deliveryId, status } = await prisma.$transaction(async (tx) => {
    // Still open? (Someone else may have closed it meanwhile.)
    const { count } = await tx.purchaseOrder.updateMany({ where: { id: poId, status: { in: ['SENT', 'PARTLY_RECEIVED'] } }, data: { updatedAt: new Date() } });
    if (count === 0) throw httpError(409, 'Only a sent order can take a delivery.');
    const delivery = await tx.purchaseDelivery.create({
      data: {
        purchaseOrderId: poId, receivedById: actor.userId, note: input.note ?? null,
        lines: { create: lines.map((l) => ({ purchaseOrderItemId: l.itemId, amount: D(l.amount), price: l.price === undefined || l.price === null ? null : D(l.price) })) },
      },
    });
    for (const l of lines) {
      await stockInFromDelivery(tx, items.get(l.itemId)!.ingredientId, D(l.amount), {
        reason: `${label} ${input.note ?? ''}`.trim(), userId: actor.userId, purchaseDeliveryId: delivery.id,
      });
    }
    if (pricesGiven) await applyPrices(tx, delivery.id, actor.userId);
    return { deliveryId: delivery.id, status: await refreshStatus(tx, poId) };
  });

  await audit({
    actorId: actor.userId, action: 'UPDATE', entityType: 'PURCHASE_ORDER', entityId: poId,
    metadata: { number: label, delivery: deliveryId, lines: lines.length, status, priced: pricesGiven },
  });
  void notifyStockChanged();
  publish({ type: 'purchasing' });
  return getPurchaseOrder(poId);
}

/** Owner: the prices of a delivery's lines (null clears one). */
export async function setDeliveryPrices(poId: string, deliveryId: string, input: PricesInput, actorId: string) {
  const d = await prisma.purchaseDelivery.findUnique({ where: { id: deliveryId }, include: { lines: { select: { id: true } }, purchaseOrder: { select: { number: true } } } });
  if (!d || d.purchaseOrderId !== poId) throw httpError(404, 'Delivery not found');
  const ids = new Set(d.lines.map((l) => l.id));
  for (const l of input.lines) if (!ids.has(l.lineId)) throw httpError(400, 'A line is not on this delivery. Reload the page.');

  const total = await prisma.$transaction(async (tx) => {
    for (const l of input.lines) {
      await tx.purchaseDeliveryLine.update({ where: { id: l.lineId }, data: { price: l.price === null ? null : D(l.price) } });
    }
    return applyPrices(tx, deliveryId, actorId);
  });
  await audit({
    actorId, action: 'UPDATE', entityType: 'PURCHASE_ORDER', entityId: poId,
    metadata: { number: formatPoNumber(d.purchaseOrder.number), delivery: deliveryId, priceTotal: total },
  });
  publish({ type: 'purchasing' });
  return getPurchaseOrder(poId);
}

/** Owner: part came and nothing more is coming — close the order as received. */
export async function completeOrder(poId: string, actorId: string) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: poId }, select: { status: true, number: true } });
  if (!po) throw httpError(404, 'Purchase order not found');
  const { count } = await prisma.purchaseOrder.updateMany({
    where: { id: poId, status: 'PARTLY_RECEIVED' },
    data: { status: 'RECEIVED', receivedAt: new Date() },
  });
  if (count === 0) throw httpError(409, 'Only a partly received order can be closed.');
  await audit({ actorId, action: 'STATUS_CHANGE', entityType: 'PURCHASE_ORDER', entityId: poId, metadata: { number: formatPoNumber(po.number), from: 'PARTLY_RECEIVED', to: 'RECEIVED' } });
  publish({ type: 'purchasing' });
  return getPurchaseOrder(poId);
}
