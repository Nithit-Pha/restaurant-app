// The alert bell (Step 3f): worked out from the current state, nothing stored.
// Pure, so it is unit-tested. Each person only sees what they may act on.
import type { PermissionSet } from '../permissions/permissions.rules';

export type AlertKind = 'urgentStock' | 'draftsWaiting' | 'deliveriesDue' | 'priceMissing';
export type AlertTone = 'danger' | 'warning' | 'info';

export interface Alert {
  kind: AlertKind;
  tone: AlertTone;
  count: number;
  names: string[]; // a few examples (ingredients, PO numbers)
  extra?: number; // e.g. how many of the drafts are urgent / deliveries late
  href: string;
}

export interface AlertState {
  urgentIngredients: { name: string }[];
  drafts: { label: string; source: 'MANUAL' | 'SCHEDULED' | 'EMERGENCY' }[];
  openOrders: { label: string; expectedDate: string | null }[]; // sent or partly received
  unpricedDeliveries: { label: string }[]; // the order of each delivery without a price
}

const FEW = 4;
const few = (names: string[]) => [...new Set(names)].slice(0, FEW);

export function buildAlerts(s: AlertState, can: PermissionSet, today: string): Alert[] {
  const out: Alert[] = [];
  if (s.urgentIngredients.length) {
    out.push({
      kind: 'urgentStock', tone: 'danger', count: s.urgentIngredients.length,
      names: few(s.urgentIngredients.map((i) => i.name)), href: '/admin/stock',
    });
  }
  if (can['orders.purchase'] && s.drafts.length) {
    const urgent = s.drafts.filter((d) => d.source === 'EMERGENCY').length;
    out.push({
      kind: 'draftsWaiting', tone: urgent ? 'danger' : 'warning', count: s.drafts.length, extra: urgent,
      names: few(s.drafts.map((d) => d.label)), href: '/admin/purchase-orders',
    });
  }
  if (can['deliveries.receive']) {
    const due = s.openOrders.filter((o) => o.expectedDate !== null && o.expectedDate <= today);
    if (due.length) {
      const late = due.filter((o) => o.expectedDate! < today).length;
      out.push({
        kind: 'deliveriesDue', tone: late ? 'warning' : 'info', count: due.length, extra: late,
        names: few(due.map((o) => o.label)), href: '/admin/purchase-orders',
      });
    }
  }
  if (can['prices.enter'] && s.unpricedDeliveries.length) {
    out.push({
      kind: 'priceMissing', tone: 'warning', count: s.unpricedDeliveries.length,
      names: few(s.unpricedDeliveries.map((d) => d.label)), href: '/admin/purchase-orders',
    });
  }
  return out;
}
