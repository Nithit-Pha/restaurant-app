import { describe, it, expect } from 'vitest';
import { priceCart, calcDeliveryFee, haversineKm } from './pricing';

// Menu prices are TAX-INCLUSIVE (the price is what the customer pays).
const burger = { unitPrice: 12.0, unitCost: 4.5, quantity: 2 };
const fries = { unitPrice: 4.5, unitCost: 1.2, quantity: 1 };
const soda = { unitPrice: 2.99, unitCost: 0.4, quantity: 3 };

describe('priceCart (tax-inclusive)', () => {
  it('with no tax, subtotal equals the gross price', () => {
    const r = priceCart([burger, fries], 0, 0); // gross 28.5, tax 0
    expect(r.subtotal).toBe(28.5);
    expect(r.totalCost).toBe(10.2); // 4.5*2 + 1.2
    expect(r.profit).toBe(18.3); // 28.5 - 10.2
    expect(r.total).toBe(28.5);
  });

  it('extracts the tax from the price: 24 @ 7% -> 22.32 + 1.68', () => {
    const r = priceCart([burger], 5, 0.07); // gross 24, delivery 5
    expect(r.taxAmount).toBe(1.68); // 24 * 0.07
    expect(r.subtotal).toBe(22.32); // 24 - 1.68 (net of tax)
    expect(r.deliveryFee).toBe(5);
    expect(r.total).toBe(29); // 24 (tax already inside) + 5 delivery
  });

  it('matches the worked example: 10 + 10 = 20 @ 7% -> 18.60 + 1.40', () => {
    const r = priceCart([{ unitPrice: 10, unitCost: 3, quantity: 2 }], 0, 0.07);
    expect(r.total).toBe(20); // customer pays the gross price
    expect(r.taxAmount).toBe(1.4); // 20 * 0.07
    expect(r.subtotal).toBe(18.6); // 20 - 1.40
  });

  it('rounds the extracted tax to 2 decimals', () => {
    const r = priceCart([soda], 0, 0.07); // gross 8.97
    expect(r.taxAmount).toBe(0.63); // 8.97 * 0.07 = 0.6279 -> 0.63
    expect(r.subtotal).toBe(8.34); // 8.97 - 0.63
    expect(r.total).toBe(8.97);
  });

  it('profit is net-of-tax revenue minus cost; delivery never counts as profit', () => {
    const r = priceCart([burger], 10, 0.07); // gross 24, net 22.32, cost 9
    expect(r.profit).toBe(13.32); // 22.32 - 9
  });

  it('handles an empty cart', () => {
    const r = priceCart([], 0, 0.07);
    expect(r.subtotal).toBe(0);
    expect(r.totalCost).toBe(0);
    expect(r.taxAmount).toBe(0);
    expect(r.total).toBe(0);
    expect(r.profit).toBe(0);
  });

  it('echoes back the tax rate used', () => {
    expect(priceCart([burger], 0, 0.085).taxRate).toBe(0.085);
  });
});

describe('calcDeliveryFee (sync, env-based)', () => {
  it('charges only the base fee within the free radius', () => {
    expect(calcDeliveryFee(0)).toBe(3.99);
    expect(calcDeliveryFee(3)).toBe(3.99);
  });

  it('adds per-km charge beyond the free radius', () => {
    expect(calcDeliveryFee(5)).toBe(5.99); // 3.99 + (5-3)*1.00
  });

  it('never goes negative for a zero/near distance', () => {
    expect(calcDeliveryFee(-1)).toBe(3.99);
  });
});

describe('haversineKm', () => {
  it('returns ~0 for identical points', () => {
    expect(haversineKm(40, -89, 40, -89)).toBeCloseTo(0, 5);
  });

  it('approximates a known distance (≈111km per degree of latitude)', () => {
    const d = haversineKm(40, -89, 41, -89);
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });

  it('is symmetric', () => {
    const a = haversineKm(39.78, -89.65, 40.71, -74.0);
    const b = haversineKm(40.71, -74.0, 39.78, -89.65);
    expect(a).toBeCloseTo(b, 6);
  });
});
