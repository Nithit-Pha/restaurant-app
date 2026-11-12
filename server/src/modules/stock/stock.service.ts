import { Prisma, StockMoveType } from '@prisma/client';
import { prisma } from '../../config/db';
import { audit } from '../../utils/auditLog';
import { countChange, isLow, stockInExpenseText } from './stock.rules';
import { planReturn, planSale } from './stock.plan';
import { notifyStockChanged } from './stock.notify';
import { isEmergency, levelProblem, packsToOrder } from '../suppliers/ordering';
import type { CountInput, IngredientInput, IngredientPatch, RecipeInput, StockInInput, WasteInput } from './stock.validation';

const httpError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

type Tx = Prisma.TransactionClient;

interface Actor {
  userId: string;
  role: string;
}

type Levels = { quantity: Prisma.Decimal; reorderLevel: Prisma.Decimal; isActive: boolean; packSize: Prisma.Decimal; targetLevel: Prisma.Decimal | null; emergencyLevel: Prisma.Decimal | null };

/** Adds "low", "emergency" and the packs to order now (0 when it is not low). */
const withLow = <T extends Levels>(ing: T) => {
  const low = isLow(ing);
  return { ...ing, low, emergency: low && isEmergency(ing), orderPacks: low ? packsToOrder(ing) : 0 };
};

const supplierSelect = { supplier: { select: { id: true, name: true, isActive: true } } } as const;

async function assertSupplier(supplierId: string | null | undefined) {
  if (!supplierId) return;
  const found = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { isActive: true } });
  if (!found) throw httpError(400, 'That supplier does not exist any more. Reload the page.');
  if (!found.isActive) throw httpError(400, 'That supplier is switched off.');
}

function assertLevels(l: Parameters<typeof levelProblem>[0]) {
  const problem = levelProblem(l);
  if (problem) throw httpError(400, problem);
}

/** All ingredients (inactive ones only on request), A to Z, each with a "low" flag. */
export async function listIngredients(includeInactive = false) {
  const rows = await prisma.ingredient.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { name: 'asc' },
    include: supplierSelect,
  });
  return rows.map(withLow);
}

async function assertNameFree(name: string, exceptId?: string) {
  const clash = await prisma.ingredient.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw httpError(409, `There is already an ingredient called "${name}".`);
}

/**
 * Change an ingredient's quantity by `change` and record why. The increment
 * happens in one UPDATE, so two changes at the same moment both count.
 */
async function applyChange(
  tx: Tx,
  ingredientId: string,
  change: Prisma.Decimal,
  type: StockMoveType,
  extra: { reason?: string | null; userId?: string; expenseId?: string; orderId?: string; purchaseDeliveryId?: string },
) {
  const { quantity } = await tx.ingredient.update({
    where: { id: ingredientId },
    data: { quantity: { increment: change } },
    select: { quantity: true },
  });
  return tx.stockMovement.create({
    data: {
      ingredientId, type, change, quantityAfter: quantity,
      reason: extra.reason?.trim() || null, userId: extra.userId, expenseId: extra.expenseId, orderId: extra.orderId,
      purchaseDeliveryId: extra.purchaseDeliveryId,
    },
  });
}

/** A delivery of a purchase order came in (Step 3d): stock up, linked to the delivery. */
export function stockInFromDelivery(tx: Tx, ingredientId: string, amount: Prisma.Decimal, extra: { reason: string; userId: string; purchaseDeliveryId: string }) {
  return applyChange(tx, ingredientId, amount, 'PURCHASE', extra);
}

const orderLabel = (n: number | null) => (n ? `#${String(n).padStart(3, '0')}` : null);

/**
 * Staff accepted the order: take the recipe ingredients out of stock. Runs in
 * the same transaction as the status change; never twice for one order.
 */
export async function deductForOrder(tx: Tx, orderId: string, actorId?: string) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { orderNumber: true, stockDeductedAt: true, items: { select: { menuItemId: true, quantity: true } } },
  });
  if (!order || order.stockDeductedAt) return [];
  const recipes = await tx.recipeItem.findMany({ where: { menuItemId: { in: order.items.map((i) => i.menuItemId) } } });
  const moves = planSale(order.items, recipes);
  for (const m of moves) {
    await applyChange(tx, m.ingredientId, m.change, 'SALE', { orderId, userId: actorId, reason: orderLabel(order.orderNumber) });
  }
  await tx.order.update({ where: { id: orderId }, data: { stockDeductedAt: new Date() } });
  return moves;
}

/** The order was cancelled after it was accepted: give back exactly what it took, once. */
export async function returnForOrder(tx: Tx, orderId: string, actorId?: string) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { orderNumber: true, stockDeductedAt: true, stockReturnedAt: true },
  });
  if (!order?.stockDeductedAt || order.stockReturnedAt) return [];
  const sales = await tx.stockMovement.findMany({ where: { orderId, type: 'SALE' }, select: { ingredientId: true, change: true } });
  const moves = planReturn(sales);
  for (const m of moves) {
    await applyChange(tx, m.ingredientId, m.change, 'SALE_RETURN', { orderId, userId: actorId, reason: orderLabel(order.orderNumber) });
  }
  await tx.order.update({ where: { id: orderId }, data: { stockReturnedAt: new Date() } });
  return moves;
}

/** A menu item's recipe: ingredients and the amount one portion uses. */
export async function getRecipe(menuItemId: string) {
  const item = await prisma.menuItem.findUnique({ where: { id: menuItemId }, select: { id: true } });
  if (!item) throw httpError(404, 'Menu item not found');
  return prisma.recipeItem.findMany({
    where: { menuItemId },
    select: { ingredientId: true, amount: true, ingredient: { select: { name: true, unit: true, isActive: true } } },
    orderBy: { ingredient: { name: 'asc' } },
  });
}

/** Replace a menu item's whole recipe (an empty list removes it). */
export async function setRecipe(menuItemId: string, items: RecipeInput['items'], actorId: string) {
  const item = await prisma.menuItem.findUnique({ where: { id: menuItemId }, select: { id: true, name: true } });
  if (!item) throw httpError(404, 'Menu item not found');
  const ids = items.map((i) => i.ingredientId);
  if (new Set(ids).size !== ids.length) throw httpError(400, 'Each ingredient can be in the recipe only once.');
  const found = await prisma.ingredient.count({ where: { id: { in: ids } } });
  if (found !== ids.length) throw httpError(400, 'An ingredient in the recipe does not exist.');
  await prisma.$transaction([
    prisma.recipeItem.deleteMany({ where: { menuItemId } }),
    prisma.recipeItem.createMany({
      data: items.map((i) => ({ menuItemId, ingredientId: i.ingredientId, amount: new Prisma.Decimal(i.amount) })),
    }),
  ]);
  await audit({ actorId, action: 'UPDATE', entityType: 'MENU_ITEM', entityId: menuItemId, metadata: { name: item.name, recipe: items } });
  void notifyStockChanged(); // a new recipe can make the dish sold out
  return getRecipe(menuItemId);
}

export async function createIngredient(input: IngredientInput, actorId: string) {
  await assertNameFree(input.name);
  await assertSupplier(input.supplierId);
  assertLevels(input);
  const ingredient = await prisma.$transaction(async (tx) => {
    const created = await tx.ingredient.create({
      data: {
        name: input.name, unit: input.unit, reorderLevel: input.reorderLevel, storage: input.storage,
        supplierId: input.supplierId ?? null, packName: input.packName ?? null, packSize: input.packSize ?? 1,
        targetLevel: input.targetLevel ?? null, emergencyLevel: input.emergencyLevel ?? null,
      },
    });
    if (input.openingStock) {
      await applyChange(tx, created.id, new Prisma.Decimal(input.openingStock), 'COUNT_ADJUST', { reason: 'Opening stock', userId: actorId });
    }
    return tx.ingredient.findUniqueOrThrow({ where: { id: created.id }, include: supplierSelect });
  });
  await audit({ actorId, action: 'CREATE', entityType: 'INGREDIENT', entityId: ingredient.id, metadata: { ...input } });
  void notifyStockChanged();
  return withLow(ingredient);
}

export async function updateIngredient(id: string, patch: IngredientPatch, actorId: string) {
  const before = await prisma.ingredient.findUnique({ where: { id } });
  if (!before) throw httpError(404, 'Ingredient not found');
  if (patch.name && patch.name.toLowerCase() !== before.name.toLowerCase()) await assertNameFree(patch.name, id);
  if (patch.unit && patch.unit !== before.unit) {
    // Amounts already recorded and recipe amounts are in the old unit.
    const [moves, recipes] = await Promise.all([
      prisma.stockMovement.count({ where: { ingredientId: id } }),
      prisma.recipeItem.count({ where: { ingredientId: id } }),
    ]);
    if (moves + recipes > 0) {
      throw httpError(409, 'The unit cannot change once stock was recorded or a recipe uses it. Add a new ingredient instead.');
    }
  }
  if (patch.supplierId && patch.supplierId !== before.supplierId) await assertSupplier(patch.supplierId);
  assertLevels({ ...before, ...patch });
  const updated = await prisma.ingredient.update({ where: { id }, data: patch, include: supplierSelect });
  const action = patch.isActive === false && before.isActive ? 'DEACTIVATE'
    : patch.isActive === true && !before.isActive ? 'REACTIVATE' : 'UPDATE';
  await audit({
    actorId, action, entityType: 'INGREDIENT', entityId: id,
    metadata: { name: before.name, before: { name: before.name, unit: before.unit, reorderLevel: before.reorderLevel, storage: before.storage, isActive: before.isActive }, after: patch },
  });
  void notifyStockChanged(); // low level or on/off changes the low count and sold-out dishes
  return withLow(updated);
}

async function activeIngredient(id: string) {
  const ing = await prisma.ingredient.findUnique({ where: { id } });
  if (!ing) throw httpError(404, 'Ingredient not found');
  if (!ing.isActive) throw httpError(409, `"${ing.name}" is switched off. Switch it on first.`);
  return ing;
}

/** Stock arrived. With a price (owner only) it is also a Finance "Food supply" expense. */
export async function stockIn(id: string, input: StockInInput, actor: Actor) {
  if (input.price !== undefined && actor.role !== 'SUPER_ADMIN') {
    throw httpError(403, 'Only the owner can enter purchase prices.');
  }
  const ing = await activeIngredient(id);
  const move = await prisma.$transaction(async (tx) => {
    const expense = input.price !== undefined
      ? await tx.expense.create({
        data: {
          amount: new Prisma.Decimal(input.price),
          category: 'FOOD_SUPPLY',
          description: stockInExpenseText(input.amount, ing.unit, ing.name, input.note),
          createdById: actor.userId,
        },
      })
      : null;
    return applyChange(tx, id, new Prisma.Decimal(input.amount), 'PURCHASE', {
      reason: input.note, userId: actor.userId, expenseId: expense?.id,
    });
  });
  await audit({
    actorId: actor.userId, action: 'UPDATE', entityType: 'INGREDIENT', entityId: id,
    metadata: { name: ing.name, move: 'PURCHASE', change: input.amount, quantityAfter: move.quantityAfter, price: input.price },
  });
  void notifyStockChanged();
  return move;
}

/**
 * Staff counted the real stock: the app takes that number and records the
 * difference. If the stock changed while they were counting, they count again.
 */
export async function countStock(id: string, input: CountInput, actor: Actor) {
  const ing = await activeIngredient(id);
  const counted = new Prisma.Decimal(input.counted);
  const change = countChange(ing.quantity, counted);
  const move = await prisma.$transaction(async (tx) => {
    const res = await tx.ingredient.updateMany({ where: { id, quantity: ing.quantity }, data: { quantity: counted } });
    if (res.count === 0) throw httpError(409, 'The stock changed while you were counting. Please count again.');
    return tx.stockMovement.create({
      data: {
        ingredientId: id, type: 'COUNT_ADJUST', change, quantityAfter: counted,
        reason: input.note?.trim() || null, userId: actor.userId,
      },
    });
  });
  await audit({
    actorId: actor.userId, action: 'UPDATE', entityType: 'INGREDIENT', entityId: id,
    metadata: { name: ing.name, move: 'COUNT_ADJUST', counted: input.counted, change: change.toString() },
  });
  void notifyStockChanged();
  return move;
}

/** Spoiled or dropped food leaves the stock, with the reason. */
export async function wasteStock(id: string, input: WasteInput, actor: Actor) {
  const ing = await activeIngredient(id);
  const move = await prisma.$transaction((tx) =>
    applyChange(tx, id, new Prisma.Decimal(input.amount).negated(), 'WASTE', { reason: input.reason, userId: actor.userId }),
  );
  await audit({
    actorId: actor.userId, action: 'UPDATE', entityType: 'INGREDIENT', entityId: id,
    metadata: { name: ing.name, move: 'WASTE', change: -input.amount, reason: input.reason },
  });
  void notifyStockChanged();
  return move;
}

/** Newest stock changes first, for one ingredient or all of them. */
export async function listMovements(opts: { ingredientId?: string; limit?: number } = {}) {
  return prisma.stockMovement.findMany({
    where: opts.ingredientId ? { ingredientId: opts.ingredientId } : {},
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(opts.limit ?? 100, 1), 500),
    select: {
      id: true, type: true, change: true, quantityAfter: true, reason: true, createdAt: true,
      ingredient: { select: { id: true, name: true, unit: true } },
      user: { select: { name: true } },
    },
  });
}
