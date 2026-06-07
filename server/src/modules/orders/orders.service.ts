import { prisma } from '../../config/db';
import { priceCart, calcDeliveryFeeAsync, haversineKm } from '../../utils/pricing';
import { getSetting } from '../settings/settings.service';
import { env } from '../../config/env';

// Restaurant coordinates (mock origin for delivery distance)
const RESTAURANT_LAT = 13.7563;
const RESTAURANT_LNG = 100.5018;

interface CartItemInput {
  menuItemId: string;
  quantity: number;
}

interface CheckoutInput {
  items: CartItemInput[];
  type: 'PICKUP' | 'DELIVERY';
  deliveryAddress?: string;
  deliveryLat?: number;
  deliveryLng?: number;
}

export async function quoteOrder(input: CheckoutInput) {
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: input.items.map((i) => i.menuItemId) }, isAvailable: true },
  });

  const lines = input.items.map((item) => {
    const mi = menuItems.find((m) => m.id === item.menuItemId);
    if (!mi) throw Object.assign(new Error(`Item ${item.menuItemId} not available`), { statusCode: 400 });
    return {
      menuItemId: mi.id,
      nameSnapshot: mi.name,
      unitPrice: Number(mi.sellingPrice),
      unitCost: Number(mi.costPrice),
      quantity: item.quantity,
    };
  });

  let deliveryFee = 0;
  if (input.type === 'DELIVERY') {
    const distKm =
      input.deliveryLat && input.deliveryLng
        ? haversineKm(RESTAURANT_LAT, RESTAURANT_LNG, input.deliveryLat, input.deliveryLng)
        : 5;
    const maxKm = await getSetting('DELIVERY_MAX_KM');
    if (maxKm > 0 && distKm > maxKm) {
      throw Object.assign(new Error(`Sorry, this address is outside our delivery area (max ${maxKm} km).`), { statusCode: 400 });
    }
    deliveryFee = await calcDeliveryFeeAsync(distKm);
  }

  const taxRate = await getSetting('TAX_RATE');
  return priceCart(lines, deliveryFee, taxRate);
}

export async function placeOrder(userId: string, input: CheckoutInput) {
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: input.items.map((i) => i.menuItemId) }, isAvailable: true },
  });

  if (menuItems.length !== input.items.length) {
    throw Object.assign(new Error('One or more items are unavailable'), { statusCode: 400 });
  }

  const lines = input.items.map((item) => {
    const mi = menuItems.find((m) => m.id === item.menuItemId)!;
    return {
      menuItemId: mi.id,
      nameSnapshot: mi.name,
      unitPrice: Number(mi.sellingPrice),
      unitCost: Number(mi.costPrice),
      quantity: item.quantity,
    };
  });

  let deliveryFee = 0;
  if (input.type === 'DELIVERY') {
    const distKm =
      input.deliveryLat && input.deliveryLng
        ? haversineKm(RESTAURANT_LAT, RESTAURANT_LNG, input.deliveryLat, input.deliveryLng)
        : 5;
    const maxKm = await getSetting('DELIVERY_MAX_KM');
    if (maxKm > 0 && distKm > maxKm) {
      throw Object.assign(new Error(`Sorry, this address is outside our delivery area (max ${maxKm} km).`), { statusCode: 400 });
    }
    deliveryFee = await calcDeliveryFeeAsync(distKm);
  }

  const taxRate = await getSetting('TAX_RATE');
  const pricing = priceCart(lines, deliveryFee, taxRate);

  return prisma.$transaction(async (tx) => {
    return tx.order.create({
      data: {
        userId,
        type: input.type,
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
          })),
        },
      },
      include: { items: true },
    });
  });
}

export async function getUserOrders(userId: string) {
  return prisma.order.findMany({
    where: { userId },
    include: { items: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getOrderById(id: string, userId?: string) {
  return prisma.order.findFirst({
    where: { id, ...(userId ? { userId } : {}) },
    include: { items: true },
  });
}

export async function getAllOrders(status?: string) {
  return prisma.order.findMany({
    where: status ? { status: status as any } : undefined,
    include: { user: { select: { id: true, name: true, email: true } }, items: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function updateOrderStatus(id: string, status: string) {
  return prisma.order.update({ where: { id }, data: { status: status as any } });
}

export async function getProfitReport(from?: Date, to?: Date) {
  return prisma.order.aggregate({
    where: {
      status: 'DELIVERED',
      ...(from || to ? { createdAt: { gte: from, lte: to } } : {}),
    },
    _sum: { subtotal: true, profit: true, total: true, taxAmount: true },
    _count: { id: true },
  });
}
