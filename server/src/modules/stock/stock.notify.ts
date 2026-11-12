// After stock changed: tell staff screens (live event) and, when the set of
// sold-out dishes changed, refresh the cached public menu pages.
import { prisma } from '../../config/db';
import { env } from '../../config/env';
import { publish } from '../../utils/events';
import { soldOutItems } from './stock.plan';
import { checkPurchasingSoon } from '../purchasing/automation';

/** Ids of menu items that cannot be made even once with the stock on hand. */
export async function soldOutMenuItemIds(): Promise<Set<string>> {
  const recipes = await prisma.recipeItem.findMany({
    select: { menuItemId: true, ingredientId: true, amount: true, ingredient: { select: { quantity: true, isActive: true } } },
  });
  return soldOutItems(recipes);
}

let lastSoldOut: string | null = null; // sorted ids, as one string; null = not known yet

/**
 * Fire and forget: never throws, never delays the change that called it.
 * The menu pages are only regenerated when a dish became sold out or available.
 */
export async function notifyStockChanged(): Promise<void> {
  try {
    publish({ type: 'stock' });
    checkPurchasingSoon(); // urgent drafts (Step 3c)
    const now = [...(await soldOutMenuItemIds())].sort().join(',');
    if (now === lastSoldOut) return;
    lastSoldOut = now;
    await fetch(env.revalidateUrl, { method: 'POST', signal: AbortSignal.timeout(5000) });
  } catch (err) {
    console.error('[stock] Could not refresh the menu after a stock change:', err instanceof Error ? err.message : err);
  }
}
