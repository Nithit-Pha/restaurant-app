// Calls for dine-in guests at a table. They have no account: the QR code's
// token is in the address and the visit key goes in the X-Visit-Key header.
import type { OrderStatus } from '../../api/apiSlice';

export interface VisitLine {
  id: string;
  name: string;
  menuItemId: string;
  quantity: number;
  unitPrice: number;
  note: string | null;
  options: { groupName: string; name: string; priceDelta: number }[];
}

export interface VisitOrder {
  id: string;
  orderNumber: number | null;
  status: OrderStatus;
  createdAt: string;
  acceptedAt: string | null;
  estimatedReadyAt: string | null;
  total: number;
  items: VisitLine[];
}

export interface Visit {
  id: string;
  tableLabel: string;
  zoneName: string;
  guests: number | null;
  confirmed: boolean;
  openedAt: string;
  staffCalledAt: string | null;
  billRequestedAt: string | null;
  closedAt: string | null;
  orders: VisitOrder[];
  totals: { subtotal: number; taxAmount: number; total: number };
}

export interface TableInfo {
  label: string;
  zoneName: string;
}

export interface TableOrderLine {
  menuItemId: string;
  quantity: number;
  modifierIds: string[];
  note?: string;
}

export class GuestApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function call<T>(path: string, { method = 'GET', key, body }: { method?: string; key?: string | null; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api/dine-in${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(key ? { 'X-Visit-Key': key } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new GuestApiError((data as { message?: string }).message ?? res.statusText, res.status);
  return data as T;
}

export const guestApi = {
  join: (qrToken: string) =>
    call<{ table: TableInfo; key: string | null; visit: Visit | null }>(`/t/${encodeURIComponent(qrToken)}/join`, { method: 'POST' }),
  order: (qrToken: string, key: string | null, items: TableOrderLine[], idempotencyKey: string) =>
    call<{ created: boolean; key: string; visit: Visit }>(`/t/${encodeURIComponent(qrToken)}/orders`, {
      method: 'POST', key, body: { items, idempotencyKey },
    }),
  visit: (key: string) => call<Visit>('/visit', { key }),
  callStaff: (key: string) => call<Visit>('/visit/call-staff', { method: 'POST', key }),
  requestBill: (key: string) => call<Visit>('/visit/request-bill', { method: 'POST', key }),
};

/** sessionStorage can be missing or throw (private mode, blocked storage): never let that break the page. */
export const store = {
  get(key: string): string | null {
    try { return sessionStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, value);
    } catch { /* ignore */ }
  },
};
