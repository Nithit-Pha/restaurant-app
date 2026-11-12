import { describe, expect, it } from 'vitest';
import { parsePermissions, permissionsFor } from '../permissions/permissions.rules';
import { buildAlerts, type AlertState } from './alerts.rules';

const STATE: AlertState = {
  urgentIngredients: [{ name: 'Rice' }, { name: 'Eggs' }],
  drafts: [{ label: 'PO-0009', source: 'SCHEDULED' }, { label: 'PO-0010', source: 'EMERGENCY' }],
  openOrders: [
    { label: 'PO-0005', expectedDate: '2026-11-11' }, // late
    { label: 'PO-0006', expectedDate: '2026-11-12' }, // today
    { label: 'PO-0007', expectedDate: '2026-11-14' }, // later
    { label: 'PO-0008', expectedDate: null },
  ],
  unpricedDeliveries: [{ label: 'PO-0004' }, { label: 'PO-0004' }],
};
const owner = permissionsFor('SUPER_ADMIN', parsePermissions(null));
const staff = permissionsFor('STAFF', parsePermissions(null));

describe('alert bell', () => {
  it('owner sees everything', () => {
    const a = buildAlerts(STATE, owner, '2026-11-12');
    expect(a.map((x) => x.kind)).toEqual(['urgentStock', 'draftsWaiting', 'deliveriesDue', 'priceMissing']);
    expect(a[0]).toMatchObject({ tone: 'danger', count: 2, names: ['Rice', 'Eggs'] });
    expect(a[1]).toMatchObject({ tone: 'danger', count: 2, extra: 1 }); // one urgent draft
    expect(a[2]).toMatchObject({ tone: 'warning', count: 2, extra: 1, names: ['PO-0005', 'PO-0006'] });
    expect(a[3]).toMatchObject({ count: 2, names: ['PO-0004'] }); // two deliveries, one order
  });

  it('staff (defaults) see urgent stock and deliveries only', () => {
    expect(buildAlerts(STATE, staff, '2026-11-12').map((x) => x.kind)).toEqual(['urgentStock', 'deliveriesDue']);
  });

  it('nothing to say: no alerts; deliveries only today are info', () => {
    expect(buildAlerts({ urgentIngredients: [], drafts: [], openOrders: [], unpricedDeliveries: [] }, owner, '2026-11-12')).toEqual([]);
    const a = buildAlerts({ ...STATE, openOrders: [{ label: 'PO-0006', expectedDate: '2026-11-12' }] }, staff, '2026-11-12');
    expect(a.find((x) => x.kind === 'deliveriesDue')).toMatchObject({ tone: 'info', extra: 0 });
  });
});
