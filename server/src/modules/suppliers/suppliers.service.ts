import { Prisma } from '@prisma/client';
import { prisma } from '../../config/db';
import { env } from '../../config/env';
import { audit } from '../../utils/auditLog';
import { businessDate } from '../../utils/businessTime';
import { nextOrderDays, scheduleProblem, type OrderSchedule } from './ordering';
import type { SupplierInput, SupplierPatch } from './suppliers.validation';

const httpError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

const scheduleOf = (s: { frequency: OrderSchedule['frequency']; weekdays: number[]; everyNDays: number | null; startDate: string | null; monthDay: number | null }): OrderSchedule =>
  ({ frequency: s.frequency, weekdays: s.weekdays, everyNDays: s.everyNDays, startDate: s.startDate, monthDay: s.monthDay });

/** Suppliers (switched-off ones on request), A to Z, with their ingredients and next order days. */
export async function listSuppliers(includeInactive = false) {
  const today = businessDate(new Date(), env.businessTimeZone);
  const rows = await prisma.supplier.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { name: 'asc' },
    include: { ingredients: { where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } } },
  });
  return rows.map((s) => ({ ...s, nextOrderDays: s.isActive ? nextOrderDays(scheduleOf(s), today, 3) : [] }));
}

async function assertNameFree(name: string, exceptId?: string) {
  const clash = await prisma.supplier.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw httpError(409, `There is already a supplier called "${name}".`);
}

function assertSchedule(s: OrderSchedule) {
  const problem = scheduleProblem(s);
  if (problem) throw httpError(400, problem);
}

const toData = (input: Partial<SupplierInput>) => ({
  ...input,
  ...(input.minOrder !== undefined ? { minOrder: input.minOrder === null ? null : new Prisma.Decimal(input.minOrder) } : {}),
});

export async function createSupplier(input: SupplierInput, actorId: string) {
  await assertNameFree(input.name);
  assertSchedule({ frequency: input.frequency, weekdays: input.weekdays, everyNDays: input.everyNDays ?? null, startDate: input.startDate ?? null, monthDay: input.monthDay ?? null });
  const supplier = await prisma.supplier.create({ data: toData(input) as Prisma.SupplierCreateInput });
  await audit({ actorId, action: 'CREATE', entityType: 'SUPPLIER', entityId: supplier.id, metadata: { name: supplier.name } });
  return supplier;
}

export async function updateSupplier(id: string, patch: SupplierPatch, actorId: string) {
  const before = await prisma.supplier.findUnique({ where: { id } });
  if (!before) throw httpError(404, 'Supplier not found');
  if (patch.name && patch.name.toLowerCase() !== before.name.toLowerCase()) await assertNameFree(patch.name, id);
  const merged = { ...before, ...patch };
  assertSchedule(scheduleOf({ ...merged, everyNDays: merged.everyNDays ?? null, startDate: merged.startDate ?? null, monthDay: merged.monthDay ?? null }));
  const updated = await prisma.supplier.update({ where: { id }, data: toData(patch) as Prisma.SupplierUpdateInput });
  const action = patch.isActive === false && before.isActive ? 'DEACTIVATE'
    : patch.isActive === true && !before.isActive ? 'REACTIVATE' : 'UPDATE';
  await audit({ actorId, action, entityType: 'SUPPLIER', entityId: id, metadata: { name: before.name, changed: Object.keys(patch) } });
  return updated;
}

/**
 * The tick list on a supplier: exactly these ingredients are delivered by it.
 * Ticked ones move here from any other supplier; unticked ones lose it.
 */
export async function setSupplierIngredients(id: string, ingredientIds: string[], actorId: string) {
  const supplier = await prisma.supplier.findUnique({ where: { id }, select: { name: true } });
  if (!supplier) throw httpError(404, 'Supplier not found');
  const found = await prisma.ingredient.count({ where: { id: { in: ingredientIds } } });
  if (found !== new Set(ingredientIds).size) throw httpError(400, 'One of the ingredients does not exist any more. Reload the page.');
  await prisma.$transaction([
    prisma.ingredient.updateMany({ where: { supplierId: id, id: { notIn: ingredientIds } }, data: { supplierId: null } }),
    prisma.ingredient.updateMany({ where: { id: { in: ingredientIds } }, data: { supplierId: id } }),
  ]);
  await audit({ actorId, action: 'UPDATE', entityType: 'SUPPLIER', entityId: id, metadata: { name: supplier.name, ingredients: ingredientIds.length } });
  return (await listSuppliers(true)).find((s) => s.id === id)!;
}
