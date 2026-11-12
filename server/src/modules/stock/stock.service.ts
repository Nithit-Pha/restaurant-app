import { Prisma, StockMoveType } from '@prisma/client';
import { prisma } from '../../config/db';
import { audit } from '../../utils/auditLog';
import { countChange, isLow, stockInExpenseText } from './stock.rules';
import type { CountInput, IngredientInput, IngredientPatch, StockInInput, WasteInput } from './stock.validation';

const httpError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

type Tx = Prisma.TransactionClient;

interface Actor {
  userId: string;
  role: string;
}

const withLow = <T extends { quantity: Prisma.Decimal; reorderLevel: Prisma.Decimal; isActive: boolean }>(ing: T) =>
  ({ ...ing, low: isLow(ing) });

/** All ingredients (inactive ones only on request), A to Z, each with a "low" flag. */
export async function listIngredients(includeInactive = false) {
  const rows = await prisma.ingredient.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { name: 'asc' },
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
  extra: { reason?: string | null; userId?: string; expenseId?: string },
) {
  const { quantity } = await tx.ingredient.update({
    where: { id: ingredientId },
    data: { quantity: { increment: change } },
    select: { quantity: true },
  });
  return tx.stockMovement.create({
    data: {
      ingredientId, type, change, quantityAfter: quantity,
      reason: extra.reason?.trim() || null, userId: extra.userId, expenseId: extra.expenseId,
    },
  });
}

export async function createIngredient(input: IngredientInput, actorId: string) {
  await assertNameFree(input.name);
  const ingredient = await prisma.$transaction(async (tx) => {
    const created = await tx.ingredient.create({
      data: { name: input.name, unit: input.unit, reorderLevel: input.reorderLevel, storage: input.storage },
    });
    if (input.openingStock) {
      await applyChange(tx, created.id, new Prisma.Decimal(input.openingStock), 'COUNT_ADJUST', { reason: 'Opening stock', userId: actorId });
    }
    return tx.ingredient.findUniqueOrThrow({ where: { id: created.id } });
  });
  await audit({ actorId, action: 'CREATE', entityType: 'INGREDIENT', entityId: ingredient.id, metadata: { ...input } });
  return withLow(ingredient);
}

export async function updateIngredient(id: string, patch: IngredientPatch, actorId: string) {
  const before = await prisma.ingredient.findUnique({ where: { id } });
  if (!before) throw httpError(404, 'Ingredient not found');
  if (patch.name && patch.name.toLowerCase() !== before.name.toLowerCase()) await assertNameFree(patch.name, id);
  if (patch.unit && patch.unit !== before.unit) {
    // Amounts already recorded (and recipes later) are in the old unit.
    const used = await prisma.stockMovement.count({ where: { ingredientId: id } });
    if (used > 0) throw httpError(409, 'The unit cannot change once stock was recorded. Add a new ingredient instead.');
  }
  const updated = await prisma.ingredient.update({ where: { id }, data: patch });
  const action = patch.isActive === false && before.isActive ? 'DEACTIVATE'
    : patch.isActive === true && !before.isActive ? 'REACTIVATE' : 'UPDATE';
  await audit({
    actorId, action, entityType: 'INGREDIENT', entityId: id,
    metadata: { name: before.name, before: { name: before.name, unit: before.unit, reorderLevel: before.reorderLevel, storage: before.storage, isActive: before.isActive }, after: patch },
  });
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
