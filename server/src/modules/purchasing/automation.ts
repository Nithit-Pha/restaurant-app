// Step 3c: drafts that make themselves.
// - Order days: when a supplier's draft time comes (closing time the day
//   before, or a set time), its low ingredients go onto a draft. Each order
//   day is checked once (OrderDayCheck), so removed lines never come back.
// - Urgent: when an ingredient first falls to its urgent level, it goes onto
//   the supplier's urgent draft, once per drop (Ingredient.urgentSince).
// Nothing is ever sent automatically. Runs inside the API: every 5 minutes,
// once at start (catch-up after the PC was off), and after stock changes.
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/db';
import { env } from '../../config/env';
import { businessDate, zonedParts } from '../../utils/businessTime';
import { publish } from '../../utils/events';
import { getRestaurantProfile } from '../settings/settings.service';
import { packsToOrder } from '../suppliers/ordering';
import { expectedDelivery, suggestLines } from './purchasing.rules';
import { dueOrderDays, urgentChanges } from './schedule.rules';

type Tx = Prisma.TransactionClient;

const INTERVAL_MS = 5 * 60_000;

/** One run at a time (timer and stock changes can overlap). */
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

/** Ingredients already coming: on a sent order not fully received yet. */
export async function ingredientsOnTheWay(tx: Tx | typeof prisma = prisma): Promise<Set<string>> {
  const items = await tx.purchaseOrderItem.findMany({
    where: { purchaseOrder: { status: { in: ['SENT', 'PARTLY_RECEIVED'] } } },
    select: { ingredientId: true },
  });
  return new Set(items.map((i) => i.ingredientId));
}

/** Copies name, unit and pack onto new lines (skips ones already on the order). */
async function addLines(tx: Tx, purchaseOrderId: string, lines: { ingredientId: string; packs: number }[]) {
  if (!lines.length) return 0;
  const existing = new Set((await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId }, select: { ingredientId: true } })).map((i) => i.ingredientId));
  const fresh = lines.filter((l) => !existing.has(l.ingredientId));
  if (!fresh.length) return 0;
  const ings = await tx.ingredient.findMany({ where: { id: { in: fresh.map((l) => l.ingredientId) } } });
  const byId = new Map(ings.map((i) => [i.id, i]));
  const { count } = await tx.purchaseOrderItem.createMany({
    data: fresh.flatMap((l) => {
      const i = byId.get(l.ingredientId);
      return i ? [{ purchaseOrderId, ingredientId: i.id, packs: l.packs, ingredientName: i.name, unit: i.unit, packName: i.packName, packSize: i.packSize }] : [];
    }),
    skipDuplicates: true,
  });
  return count;
}

const openDraftOf = (tx: Tx, supplierId: string, source?: 'EMERGENCY') =>
  tx.purchaseOrder.findFirst({
    where: { supplierId, status: 'DRAFT', ...(source ? { source } : {}) },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

const isUniqueClash = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

/** Makes the drafts of order days that are due. Returns how many orders changed. */
export async function checkOrderDays(now = new Date()): Promise<number> {
  const tz = env.businessTimeZone;
  const p = zonedParts(now, tz);
  const moment = { ymd: businessDate(now, tz), minute: p.hour * 60 + p.minute };
  const today = moment.ymd;
  const { openingHours } = await getRestaurantProfile();
  const suppliers = await prisma.supplier.findMany({
    where: { isActive: true },
    include: { ingredients: { where: { isActive: true } } },
  });

  let changed = 0;
  for (const s of suppliers) {
    for (const day of dueOrderDays(s, openingHours ?? [], moment)) {
      try {
        changed += await prisma.$transaction(async (tx) => {
          // Claims the day first: a second run (or a restart) skips it.
          await tx.orderDayCheck.create({ data: { supplierId: s.id, orderDay: day } });
          const coming = await ingredientsOnTheWay(tx);
          const lines = suggestLines(s.ingredients.filter((i) => !coming.has(i.id)));
          const open = await openDraftOf(tx, s.id);
          let poId: string | null = null;
          if (open) {
            // Already a draft for this supplier: add what is missing, keep the owner's lines.
            if (await addLines(tx, open.id, lines)) poId = open.id;
          } else if (lines.length) {
            const po = await tx.purchaseOrder.create({
              data: { supplierId: s.id, source: 'SCHEDULED', orderDay: day, expectedDate: expectedDelivery(day < today ? today : day, s.leadTimeDays) },
            });
            await addLines(tx, po.id, lines);
            poId = po.id;
          }
          if (poId) await tx.orderDayCheck.update({ where: { supplierId_orderDay: { supplierId: s.id, orderDay: day } }, data: { purchaseOrderId: poId } });
          return poId ? 1 : 0;
        });
      } catch (err) {
        if (!isUniqueClash(err)) throw err; // already checked: fine
      }
    }
  }
  return changed;
}

/** Starts and ends urgent spells; new ones go onto the supplier's urgent draft. Returns how many orders changed. */
export async function checkUrgent(now = new Date()): Promise<number> {
  const ingredients = await prisma.ingredient.findMany({
    where: { OR: [{ emergencyLevel: { not: null } }, { urgentSince: { not: null } }] },
    include: { supplier: { select: { id: true, isActive: true, leadTimeDays: true } } },
  });
  const { start, end } = urgentChanges(ingredients);
  if (!start.length && !end.length) return 0;

  if (end.length) await prisma.ingredient.updateMany({ where: { id: { in: end.map((i) => i.id) } }, data: { urgentSince: null } });
  if (!start.length) return 0;

  return prisma.$transaction(async (tx) => {
    await tx.ingredient.updateMany({ where: { id: { in: start.map((i) => i.id) }, urgentSince: null }, data: { urgentSince: now } });
    // Already on an open order (draft or sent)? Then it is taken care of.
    const onOrders = new Set((await tx.purchaseOrderItem.findMany({
      where: { ingredientId: { in: start.map((i) => i.id) }, purchaseOrder: { status: { in: ['DRAFT', 'SENT', 'PARTLY_RECEIVED'] } } },
      select: { ingredientId: true },
    })).map((i) => i.ingredientId));

    const bySupplier = new Map<string, { leadTimeDays: number; lines: { ingredientId: string; packs: number }[] }>();
    for (const i of start) {
      if (!i.supplier?.isActive || onOrders.has(i.id)) continue;
      const entry = bySupplier.get(i.supplier.id) ?? { leadTimeDays: i.supplier.leadTimeDays, lines: [] };
      entry.lines.push({ ingredientId: i.id, packs: Math.max(1, packsToOrder(i)) });
      bySupplier.set(i.supplier.id, entry);
    }

    let changed = 0;
    const today = businessDate(now, env.businessTimeZone);
    for (const [supplierId, { leadTimeDays, lines }] of bySupplier) {
      const open = await openDraftOf(tx, supplierId, 'EMERGENCY');
      const poId = open?.id ?? (await tx.purchaseOrder.create({
        data: { supplierId, source: 'EMERGENCY', expectedDate: expectedDelivery(today, leadTimeDays) },
      })).id;
      if (await addLines(tx, poId, lines)) changed++;
    }
    return changed;
  });
}

/** Both checks, one at a time; tells staff screens when drafts changed. Never throws. */
export function runPurchasingChecks(reason: string): Promise<void> {
  return serial(async () => {
    try {
      const changed = (await checkOrderDays()) + (await checkUrgent());
      if (changed) {
        console.log(`[purchasing] ${changed} draft order(s) made or updated (${reason})`);
        publish({ type: 'purchasing' });
      }
    } catch (err) {
      console.error('[purchasing] Automatic draft check failed:', err instanceof Error ? err.message : err);
    }
  });
}

let soon: NodeJS.Timeout | undefined;
/** After stock changes: wait 2 s so a burst of changes is checked once. */
export function checkPurchasingSoon(): void {
  if (env.nodeEnv === 'test') return;
  clearTimeout(soon);
  soon = setTimeout(() => void runPurchasingChecks('stock changed'), 2000);
  soon.unref?.();
}

/** Starts the 5-minute timer (and a first check a few seconds after start). */
export function startPurchasingTimer(): void {
  setTimeout(() => void runPurchasingChecks('start'), 5000).unref?.();
  setInterval(() => void runPurchasingChecks('timer'), INTERVAL_MS).unref?.();
}
