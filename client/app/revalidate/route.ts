import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

// Called by the admin UI after a menu or restaurant-profile change so the
// cached public storefront (home, menu, llms.txt) regenerates immediately
// instead of waiting for the ISR window to expire.
// Note: lives at /revalidate (not /api/...) because next.config rewrites
// /api/* to the Express backend.
export async function POST() {
  // Pages live under /en/... and /th/...: refresh the home and menu pages of both.
  revalidatePath('/[locale]', 'page');
  revalidatePath('/[locale]/menu', 'page');
  revalidatePath('/llms.txt');
  return NextResponse.json({ revalidated: true, now: Date.now() });
}
