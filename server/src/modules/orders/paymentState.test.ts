import { describe, expect, it } from 'vitest';
import { planPayment, type PaymentSnapshot } from './paymentState';

const order = (o: Partial<PaymentSnapshot> = {}): PaymentSnapshot => ({
  paymentMethod: 'PROMPTPAY',
  paymentStatus: 'UNPAID',
  status: 'PENDING',
  ...o,
});

describe('planPayment', () => {
  it('customer reports a PromptPay transfer: UNPAID -> PENDING', () => {
    expect(planPayment(order(), 'CUSTOMER_SENT')).toBe('PENDING');
  });

  it('customer cannot report a transfer for a cash order, twice, or after cancel', () => {
    expect(() => planPayment(order({ paymentMethod: 'CASH' }), 'CUSTOMER_SENT')).toThrow('cash');
    expect(() => planPayment(order({ paymentStatus: 'PENDING' }), 'CUSTOMER_SENT')).toThrow('already');
    expect(() => planPayment(order({ status: 'CANCELLED' }), 'CUSTOMER_SENT')).toThrow('cancelled');
  });

  it('staff mark paid from UNPAID (cash) or PENDING (PromptPay)', () => {
    expect(planPayment(order({ paymentMethod: 'CASH' }), 'MARK_PAID')).toBe('PAID');
    expect(planPayment(order({ paymentStatus: 'PENDING' }), 'MARK_PAID')).toBe('PAID');
  });

  it('cannot mark paid twice or after a refund', () => {
    expect(() => planPayment(order({ paymentStatus: 'PAID' }), 'MARK_PAID')).toThrow('already paid');
    expect(() => planPayment(order({ paymentStatus: 'REFUNDED' }), 'MARK_PAID')).toThrow('refunded');
  });

  it('a cancelled order can be marked paid only if the customer had already transferred', () => {
    expect(planPayment(order({ status: 'CANCELLED', paymentStatus: 'PENDING' }), 'MARK_PAID')).toBe('PAID');
    expect(() => planPayment(order({ status: 'CANCELLED' }), 'MARK_PAID')).toThrow('nothing was paid');
  });

  it('only a paid order can be refunded', () => {
    expect(planPayment(order({ paymentStatus: 'PAID' }), 'REFUND')).toBe('REFUNDED');
    for (const s of ['UNPAID', 'PENDING', 'REFUNDED'] as const) {
      expect(() => planPayment(order({ paymentStatus: s }), 'REFUND')).toThrow('Only a paid order');
    }
  });

  it('errors carry HTTP 409', () => {
    try {
      planPayment(order({ paymentStatus: 'PAID' }), 'MARK_PAID');
    } catch (err) {
      expect((err as { statusCode?: number }).statusCode).toBe(409);
    }
    expect.assertions(1);
  });
});
