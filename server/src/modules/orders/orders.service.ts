import { prisma } from '../../config/db';
import { priceCart, calcDeliveryFeeAsync, haversineKm } from '../../utils/pricing';
import { getSetting, getRestaurantProfile } from '../settings/settings.service';

// Distance assumed when the customer shares no location and no max delivery
// distance is configured.
const DEFAULT_DELIVERY_KM = 5;

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

const badRequest = (message: string) => Object.assign(new Error(message), { statusCode: 400 });

/** Look up the cart's menu items and snapshot their current price and cost. */
async function buildLines(items: CartItemInput[]) {
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: items.map((i) => i.menuItemId) }, isAvailable: true },
  });
  return items.map((item) => {
    const mi = menuItems.find((m) => m.id === item.menuItemId);
    if (!mi) throw badRequest('One or more items are unavailable');
    return {
      menuItemId: mi.id,
      nameSnapshot: mi.name,
      unitPrice: Number(mi.sellingPrice),
      unitCost: Number(mi.costPrice),
      quantity: item.quantity,
    };
  });
}

/**
 * Delivery fee. Distance is measured from the restaurant's own location
 * (Settings -> Restaurant profile -> latitude/longitude). When a max delivery
 * distance is set, the customer's location is required to enforce it.
 */
async function calcDelivery(input: CheckoutInput): Promise<number> {
  if (input.type !== 'DELIVERY') return 0;
  const maxKm = await getSetting('DELIVERY_MAX_KM');
  const hasCoords = input.deliveryLat != null && input.deliveryLng != null;

  if (!hasCoords) {
    if (maxKm > 0) {
      throw badRequest('Please share your location so we can check your address is within our delivery area.');
    }
    return calcDeliveryFeeAsync(DEFAULT_DELIVERY_KM);
  }

  const { geo } = await getRestaurantProfile();
  const distKm = haversineKm(geo.latitude, geo.longitude, input.deliveryLat!, input.deliveryLng!);
  if (maxKm > 0 && distKm > maxKm) {
    throw badRequest(`Sorry, this address is outside our delivery area (max ${maxKm} km).`);
  }
  return calcDeliveryFeeAsync(distKm);
}

/** One pricing path for both the checkout quote and the placed order. */
async function priceOrder(input: CheckoutInput) {
  const lines = await buildLines(input.items);
  const deliveryFee = await calcDelivery(input);
  const taxRate = await getSetting('TAX_RATE');
  return { lines, pricing: priceCart(lines, deliveryFee, taxRate) };
}

export async function quoteOrder(input: CheckoutInput) {
  const { pricing } = await priceOrder(input);
  return pricing;
}

export async function placeOrder(userId: string, input: CheckoutInput) {
  const { lines, pricing } = await priceOrder(input);

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
