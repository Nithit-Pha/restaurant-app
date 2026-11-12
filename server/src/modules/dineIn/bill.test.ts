import { describe, it, expect } from 'vitest';
import { planBillPayment, type BillOrder } from './bill';

const o = (n: number, status: string, paymentStatus = 'UNPAID', total = 100): BillOrder => ({ id: `o${n}`, orderNumber: n, status, paymentStatus, total });

describe('paying a table bill', () => {
  it('pays every served order that is not paid yet, cancelled ones left out', () => {
    const plan = planBillPayment([o(1, 'DELIVERED', 'UNPAID', 160), o(2, 'CANCELLED', 'UNPAID', 50), o(3, 'DELIVERED', 'UNPAID', 80.5)]);
    expect(plan.pay.map((x) => x.id)).toEqual(['o1', 'o3']);
    expect(plan.total).toBe(240.5);
    expect(plan.serve).toEqual([]);
  });

  it('asks before closing while dishes are still cooking or ready (NOT_SERVED), then serves them', () => {
    const orders = [o(41, 'DELIVERED'), o(42, 'READY'), o(43, 'PREPARING')];
    expect(() => planBillPayment(orders)).toThrow(expect.objectContaining({ statusCode: 409, publicCode: 'NOT_SERVED', message: expect.stringContaining('#042, #043') }));
    expect(planBillPayment(orders, true).serve.map((x) => x.id)).toEqual(['o42', 'o43']);
  });

  it('refuses while an order was never accepted, even with markServed (NOT_ACCEPTED)', () => {
    expect(() => planBillPayment([o(1, 'DELIVERED'), o(7, 'PENDING')], true))
      .toThrow(expect.objectContaining({ publicCode: 'NOT_ACCEPTED', message: expect.stringContaining('#007') }));
  });

  it('has nothing to pay when everything is paid or cancelled', () => {
    expect(() => planBillPayment([o(1, 'DELIVERED', 'PAID'), o(2, 'CANCELLED')])).toThrow(expect.objectContaining({ statusCode: 409 }));
    expect(() => planBillPayment([])).toThrow(expect.objectContaining({ statusCode: 409 }));
  });
});
