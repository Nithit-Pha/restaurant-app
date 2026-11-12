import { prisma } from '../../config/db';
import { env } from '../../config/env';
import { businessDate } from '../../utils/businessTime';
import { permissionsFor } from '../permissions/permissions.rules';
import { getStaffPermissions } from '../permissions/permissions.service';
import { formatPoNumber } from '../purchasing/purchasing.rules';
import { isEmergency } from '../suppliers/ordering';
import { buildAlerts, type AlertState } from './alerts.rules';

/** Everything the bell needs, read fresh. */
export async function alertState(): Promise<AlertState> {
  const [ingredients, drafts, open, unpriced] = await Promise.all([
    prisma.ingredient.findMany({
      where: { isActive: true, emergencyLevel: { not: null } },
      select: { name: true, quantity: true, reorderLevel: true, emergencyLevel: true },
      orderBy: { name: 'asc' },
    }),
    prisma.purchaseOrder.findMany({ where: { status: 'DRAFT' }, select: { number: true, source: true }, orderBy: { number: 'asc' } }),
    prisma.purchaseOrder.findMany({ where: { status: { in: ['SENT', 'PARTLY_RECEIVED'] } }, select: { number: true, expectedDate: true }, orderBy: { expectedDate: 'asc' } }),
    prisma.purchaseDelivery.findMany({ where: { priceTotal: null }, select: { purchaseOrder: { select: { number: true } } }, orderBy: { receivedAt: 'asc' } }),
  ]);
  return {
    urgentIngredients: ingredients.filter((i) => isEmergency(i)).map((i) => ({ name: i.name })),
    drafts: drafts.map((d) => ({ label: formatPoNumber(d.number), source: d.source })),
    openOrders: open.map((o) => ({ label: formatPoNumber(o.number), expectedDate: o.expectedDate })),
    unpricedDeliveries: unpriced.map((d) => ({ label: formatPoNumber(d.purchaseOrder.number) })),
  };
}

/** The bell for one signed-in staff member or owner. */
export async function alertsFor(role: string) {
  const [state, staff] = await Promise.all([alertState(), getStaffPermissions()]);
  return buildAlerts(state, permissionsFor(role, staff), businessDate(new Date(), env.businessTimeZone));
}
