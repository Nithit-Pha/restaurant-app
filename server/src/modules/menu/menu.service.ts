import { prisma } from '../../config/db';

export async function getMenuItems(category?: string, availableOnly = true) {
  return prisma.menuItem.findMany({
    where: {
      ...(availableOnly ? { isAvailable: true } : {}),
      ...(category ? { category } : {}),
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
}

export async function getMenuItem(id: string) {
  return prisma.menuItem.findUnique({ where: { id } });
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
