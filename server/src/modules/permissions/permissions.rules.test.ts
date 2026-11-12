import { describe, expect, it } from 'vitest';
import { PERMISSIONS, can, parsePermissions, permissionsFor } from './permissions.rules';

describe('staff permissions', () => {
  it('defaults: receive and stock moves on; orders, suppliers and prices off', () => {
    expect(parsePermissions(null)).toEqual(PERMISSIONS);
    expect(parsePermissions(null)).toEqual({
      'orders.purchase': false, 'suppliers.edit': false, 'deliveries.receive': true, 'stock.moves': true, 'prices.enter': false,
    });
  });

  it('keeps stored choices, fills the rest, ignores junk', () => {
    const p = parsePermissions(JSON.stringify({ 'orders.purchase': true, 'stock.moves': false, nonsense: true, 'prices.enter': 'yes' }));
    expect(p['orders.purchase']).toBe(true);
    expect(p['stock.moves']).toBe(false);
    expect(p['prices.enter']).toBe(false); // not a boolean → default
    expect(p).not.toHaveProperty('nonsense');
    expect(parsePermissions('{broken')).toEqual(PERMISSIONS);
    expect(parsePermissions('[1,2]')).toEqual(PERMISSIONS);
  });

  it('the owner may always; staff as set; customers never', () => {
    const staff = parsePermissions(JSON.stringify({ 'orders.purchase': true }));
    expect(can('SUPER_ADMIN', parsePermissions(JSON.stringify({ 'orders.purchase': false })), 'orders.purchase')).toBe(true);
    expect(can('STAFF', staff, 'orders.purchase')).toBe(true);
    expect(can('STAFF', staff, 'prices.enter')).toBe(false);
    expect(can('CUSTOMER', staff, 'deliveries.receive')).toBe(false);
    expect(can(undefined, staff, 'deliveries.receive')).toBe(false);
    expect(Object.values(permissionsFor('SUPER_ADMIN', staff)).every(Boolean)).toBe(true);
  });
});
