import { describe, it, expect } from 'vitest';
import { allowedNext, planTransition } from './orderStateMachine';

const NOW = new Date('2026-11-11T05:00:00Z');

describe('allowedNext', () => {
  it('pickup goes PREPARING → READY → DELIVERED and never out for delivery', () => {
    expect(allowedNext('PENDING', 'PICKUP')).toEqual(['PREPARING', 'CANCELLED']);
    expect(allowedNext('PREPARING', 'PICKUP')).toEqual(['READY', 'CANCELLED']);
    expect(allowedNext('READY', 'PICKUP')).toEqual(['DELIVERED', 'CANCELLED']);
  });

  it('delivery goes READY → OUT_FOR_DELIVERY → DELIVERED', () => {
    expect(allowedNext('READY', 'DELIVERY')).toEqual(['OUT_FOR_DELIVERY', 'CANCELLED']);
    expect(allowedNext('OUT_FOR_DELIVERY', 'DELIVERY')).toEqual(['DELIVERED', 'CANCELLED']);
    // Dine-in: ready → served (DELIVERED), never out for delivery.
    expect(allowedNext('READY', 'DINE_IN')).toEqual(['DELIVERED', 'CANCELLED']);
  });

  it('final statuses allow nothing', () => {
    expect(allowedNext('DELIVERED', 'DELIVERY')).toEqual([]);
    expect(allowedNext('CANCELLED', 'PICKUP')).toEqual([]);
  });
});

describe('planTransition', () => {
  it('accepting sets acceptedAt and the estimated ready time', () => {
    const data = planTransition({ status: 'PENDING', type: 'PICKUP' }, { to: 'PREPARING', prepMinutes: 20 }, NOW);
    expect(data.status).toBe('PREPARING');
    expect(data.acceptedAt).toEqual(NOW);
    expect(data.estimatedReadyAt).toEqual(new Date('2026-11-11T05:20:00Z'));
  });

  it('accepting without a valid prep time is a 400', () => {
    expect(() => planTransition({ status: 'PENDING', type: 'PICKUP' }, { to: 'PREPARING' }, NOW))
      .toThrow(expect.objectContaining({ statusCode: 400 }));
    expect(() => planTransition({ status: 'PENDING', type: 'PICKUP' }, { to: 'PREPARING', prepMinutes: 0 }, NOW))
      .toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  it('ready and delivered stamp their times', () => {
    expect(planTransition({ status: 'PREPARING', type: 'PICKUP' }, { to: 'READY' }, NOW).readyAt).toEqual(NOW);
    expect(planTransition({ status: 'READY', type: 'PICKUP' }, { to: 'DELIVERED' }, NOW).completedAt).toEqual(NOW);
  });

  it('cancelling needs a reason and records who and why', () => {
    expect(() => planTransition({ status: 'PENDING', type: 'PICKUP' }, { to: 'CANCELLED' }, NOW))
      .toThrow(expect.objectContaining({ statusCode: 400 }));
    const data = planTransition(
      { status: 'PREPARING', type: 'DELIVERY' },
      { to: 'CANCELLED', cancelReason: 'SOLD_OUT', cancelNote: '  no more basil ', actorId: 'staff-1' },
      NOW,
    );
    expect(data).toMatchObject({ status: 'CANCELLED', cancelReason: 'SOLD_OUT', cancelNote: 'no more basil', cancelledById: 'staff-1', cancelledAt: NOW });
  });

  it('blocks illegal jumps with a 409', () => {
    const cases: [any, any, any][] = [
      ['DELIVERED', 'PICKUP', 'PREPARING'],   // reopen a finished order
      ['CANCELLED', 'PICKUP', 'READY'],       // revive a cancelled order
      ['PENDING', 'PICKUP', 'DELIVERED'],     // skip the kitchen
      ['READY', 'PICKUP', 'OUT_FOR_DELIVERY'], // pickup never goes out
      ['PREPARING', 'DELIVERY', 'PENDING'],   // go backwards
    ];
    for (const [status, type, to] of cases) {
      expect(() => planTransition({ status, type }, { to, prepMinutes: 10 }, NOW))
        .toThrow(expect.objectContaining({ statusCode: 409 }));
    }
  });
});
