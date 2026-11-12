import { describe, expect, it } from 'vitest';
import { canReceive, deliveryExpenseText, orderedAmount, packPrice, remainingAmount, statusAfterDeliveries } from './receiving.rules';

describe('receiving rules', () => {
  it('only sent or partly received orders take deliveries', () => {
    expect(canReceive('SENT')).toBe(true);
    expect(canReceive('PARTLY_RECEIVED')).toBe(true);
    expect(canReceive('DRAFT')).toBe(false);
    expect(canReceive('RECEIVED')).toBe(false);
    expect(canReceive('CANCELLED')).toBe(false);
  });

  it('works out ordered and remaining amounts', () => {
    expect(orderedAmount({ packs: 3, packSize: '0.5' })).toBe(1.5);
    expect(remainingAmount({ packs: 5, packSize: 5 }, '12.5')).toBe(12.5);
    expect(remainingAmount({ packs: 1, packSize: 5 }, 6)).toBe(0); // more came than ordered
  });

  it('status follows what came in', () => {
    expect(statusAfterDeliveries([{ ordered: 25, received: 0 }])).toBe('SENT');
    expect(statusAfterDeliveries([{ ordered: 25, received: 25 }, { ordered: 3, received: 1 }])).toBe('PARTLY_RECEIVED');
    expect(statusAfterDeliveries([{ ordered: 25, received: 25.2 }, { ordered: 3, received: 3 }])).toBe('RECEIVED');
    expect(statusAfterDeliveries([{ ordered: 0.3, received: 0.1 + 0.2 }])).toBe('RECEIVED'); // decimals
  });

  it('pack price comes from the line price and what came', () => {
    expect(packPrice(450, 15, 5)).toBe(150); // 3 bags of 5 kg for 450
    expect(packPrice(100, 4.8, 5)).toBe(104.17); // a bit short in weight
    expect(packPrice(100, 0, 5)).toBeNull();
  });

  it('names the expense after the order and the delivery', () => {
    expect(deliveryExpenseText('PO-0007', 'Talad Thai', 2)).toBe('PO-0007 Talad Thai (delivery 2)');
  });
});
