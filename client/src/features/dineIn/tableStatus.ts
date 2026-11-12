import type { TableStatus, VisitBrief } from '../../api/apiSlice';

/** Table fill on the floor view, one soft colour per status. */
// Theme colours at low strength: clear apart in light and dark mode, text stays readable.
export const STATUS_FILL: Record<TableStatus, string> = {
  FREE: 'rgb(var(--surface))',
  SEATED: 'rgb(var(--info) / 0.24)',
  ORDERED: 'rgb(var(--warning) / 0.28)',
  SERVED: 'rgb(var(--success) / 0.26)',
  BILL_REQUESTED: 'rgb(var(--accent) / 0.34)',
  CLEANING: 'rgb(var(--line-strong) / 0.3)',
};

export const STATUS_ORDER: TableStatus[] = ['FREE', 'SEATED', 'ORDERED', 'SERVED', 'BILL_REQUESTED', 'CLEANING'];

/** Something a waiter should look at now. */
export function needsAttention(v: VisitBrief | undefined): boolean {
  return Boolean(v && (v.staffCalledAt || v.billRequestedAt || !v.confirmed || v.orders.ready > 0));
}

export const minutesSince = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
