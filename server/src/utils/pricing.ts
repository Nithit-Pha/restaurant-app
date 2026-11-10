import { env } from '../config/env';
import { getSetting } from '../modules/settings/settings.service';

interface CartLine {
  unitPrice: number;
  unitCost: number;
  quantity: number;
}

export interface PricingResult {
  subtotal: number;    // net of tax (ex-tax)
  totalCost: number;
  taxRate: number;
  taxAmount: number;   // tax portion already inside the menu prices
  deliveryFee: number;
  total: number;       // what the customer pays (prices are tax-inclusive)
  profit: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Haversine distance in km between two lat/lng pairs */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Compute delivery fee given distance in km (uses DB settings, falls back to env) */
export async function calcDeliveryFeeAsync(distanceKm: number): Promise<number> {
  const baseFee = await getSetting('DELIVERY_BASE_FEE');
  const feePerKm = await getSetting('DELIVERY_FEE_PER_KM');
  const freeKm = await getSetting('DELIVERY_FREE_KM');
  const extra = Math.max(0, distanceKm - freeKm);
  return round2(baseFee + extra * feePerKm);
}

/** Sync version used for client-side display estimation */
export function calcDeliveryFee(distanceKm: number): number {
  const extra = Math.max(0, distanceKm - env.deliveryFreeKm);
  return round2(env.deliveryBaseFee + extra * env.deliveryFeePerKm);
}

/**
 * Price a cart server-side.
 * Menu prices are TAX-INCLUSIVE — the sum of selling prices is what the
 * customer pays. We still break out the tax portion that sits inside that
 * price: tax = gross × rate / (1 + rate).
 * e.g. 10 + 10 = 20 with 7% tax -> subtotal 18.69 + tax 1.31 = 20.00
 * (check: 18.69 × 1.07 = 20.00).
 */
export function priceCart(lines: CartLine[], deliveryFee = 0, taxRate = env.taxRate): PricingResult {
  const gross      = round2(lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0)); // tax-inclusive
  const totalCost  = round2(lines.reduce((s, l) => s + l.unitCost  * l.quantity, 0));
  const taxAmount  = round2((gross * taxRate) / (1 + taxRate)); // tax already contained in the price
  const subtotal   = round2(gross - taxAmount); // net of tax
  const total      = round2(gross + deliveryFee);
  const profit     = round2(subtotal - totalCost); // profit on net (ex-tax) revenue

  return { subtotal, totalCost, taxRate, taxAmount, deliveryFee, total, profit };
}
