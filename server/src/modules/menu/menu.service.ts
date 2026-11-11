import { Prisma } from '@prisma/client';
import { prisma } from '../../config/db';

/** Option groups in display order. The public menu only sees available options. */
const optionsInclude = (availableOnly: boolean) => ({
  modifierGroups: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      modifiers: {
        where: availableOnly ? { isAvailable: true } : {},
        orderBy: { sortOrder: 'asc' as const },
      },
    },
  },
});

export async function getMenuItems(category?: string, availableOnly = true) {
  return prisma.menuItem.findMany({
    where: {
      ...(availableOnly ? { isAvailable: true } : {}),
      ...(category ? { category } : {}),
    },
    include: optionsInclude(availableOnly),
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
}

export async function getMenuItem(id: string, availableOnly = true) {
  return prisma.menuItem.findUnique({ where: { id }, include: optionsInclude(availableOnly) });
}

export interface OptionGroupInput {
  id?: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  modifiers: { id?: string; name: string; priceDelta: number; isAvailable: boolean }[];
}

const badRequest = (message: string) => Object.assign(new Error(message), { statusCode: 400 });

/**
 * Replace an item's option groups with `groups` (in display order). Groups
 * and options sent with an id are updated, without one are created, and the
 * ones left out are deleted. Past orders keep their copy of the options.
 */
export async function setItemOptions(menuItemId: string, groups: OptionGroupInput[]) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.menuItem.findUnique({
      where: { id: menuItemId },
      include: { modifierGroups: { include: { modifiers: { select: { id: true } } } } },
    });
    if (!item) throw Object.assign(new Error('Item not found'), { statusCode: 404 });

    const ownGroups = new Map(item.modifierGroups.map((g) => [g.id, new Set(g.modifiers.map((m) => m.id))]));
    for (const g of groups) {
      if (g.id && !ownGroups.has(g.id)) throw badRequest('An option group does not belong to this item.');
      for (const m of g.modifiers) {
        if (m.id && (!g.id || !ownGroups.get(g.id)!.has(m.id))) throw badRequest('An option does not belong to this group.');
      }
    }

    const keepGroupIds = groups.map((g) => g.id).filter((id): id is string => !!id);
    await tx.modifierGroup.deleteMany({ where: { menuItemId, id: { notIn: keepGroupIds } } });

    for (const [gi, g] of groups.entries()) {
      const groupData = { name: g.name, minSelect: g.minSelect, maxSelect: g.maxSelect, sortOrder: gi };
      const groupId = g.id
        ? (await tx.modifierGroup.update({ where: { id: g.id }, data: groupData })).id
        : (await tx.modifierGroup.create({ data: { ...groupData, menuItemId } })).id;

      const keepIds = g.modifiers.map((m) => m.id).filter((id): id is string => !!id);
      await tx.modifier.deleteMany({ where: { groupId, id: { notIn: keepIds } } });
      for (const [mi, m] of g.modifiers.entries()) {
        const data = { name: m.name, priceDelta: new Prisma.Decimal(m.priceDelta), isAvailable: m.isAvailable, sortOrder: mi };
        if (m.id) await tx.modifier.update({ where: { id: m.id }, data });
        else await tx.modifier.create({ data: { ...data, groupId } });
      }
    }

    return tx.menuItem.findUnique({ where: { id: menuItemId }, include: optionsInclude(false) });
  });
}

export async function getCategories() {
  const items = await prisma.menuItem.findMany({
    select: { category: true },
    distinct: ['category'],
    orderBy: { category: 'asc' },
  });
  return items.map((i) => i.category);
}

export async function createMenuItem(data: {
  name: string;
  description?: string;
  category: string;
  costPrice: number;
  sellingPrice: number;
  imageUrl?: string;
}) {
  return prisma.menuItem.create({ data });
}

export async function updateMenuItem(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    category: string;
    costPrice: number;
    sellingPrice: number;
    imageUrl: string;
    isAvailable: boolean;
  }>
) {
  return prisma.menuItem.update({ where: { id }, data });
}

export async function toggleAvailability(id: string, isAvailable: boolean) {
  return prisma.menuItem.update({ where: { id }, data: { isAvailable } });
}

export async function deleteMenuItem(id: string) {
  const refs = await prisma.orderItem.count({ where: { menuItemId: id } });
  if (refs > 0) {
    // Past orders reference this item, so keep it for history and hide it.
    await prisma.menuItem.update({ where: { id }, data: { isAvailable: false } });
    return { hidden: true };
  }
  await prisma.menuItem.delete({ where: { id } });
  return { hidden: false };
}
