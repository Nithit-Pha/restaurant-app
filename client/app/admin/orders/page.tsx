'use client';

import { useMemo, useState } from 'react';
import { useGetAdminOrdersQuery, useUpdateOrderStatusMutation } from '../../../src/api/apiSlice';
import OrderStatusBadge from '../../../src/features/orders/OrderStatusBadge';
import { formatCurrency } from '../../../src/lib/format';
import { useRequireRole } from '../../../src/routes/useAuthGuard';

const STATUSES = ['', 'PENDING', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];
const NEXT_STATUS: Record<string, string> = {
  PENDING: 'PREPARING',
  PREPARING: 'OUT_FOR_DELIVERY',
  OUT_FOR_DELIVERY: 'DELIVERED',
};

// --- date helpers (local time, YYYY-MM-DD) ---
const todayISO = () => new Date().toLocaleDateString('en-CA');
const localDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA');
const ddmmyyyy = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
const shiftDay = (iso: string, delta: number) => {
  const dt = new Date(`${iso}T00:00:00`);
  dt.setDate(dt.getDate() + delta);
  return dt.toLocaleDateString('en-CA');
};

export default function AdminOrdersPage() {
  const { ready } = useRequireRole('STAFF');
  const [filterStatus, setFilterStatus] = useState('');
  const [day, setDay] = useState(''); // '' = all dates
  const { data: orders = [], isLoading } = useGetAdminOrdersQuery(
    { status: filterStatus || undefined },
    { pollingInterval: 15000, skip: !ready }
  );
  const [updateStatus] = useUpdateOrderStatusMutation();

  const visibleOrders = useMemo(
    () => (day ? orders.filter((o) => localDay(o.createdAt) === day) : orders),
    [orders, day]
  );

  if (!ready) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Orders</h1>

        <div className="flex flex-wrap items-center gap-3">
          {/* Date stepper: ‹ DD/MM/YYYY ›  */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setDay((d) => (d ? shiftDay(d, -1) : todayISO()))}
              aria-label="Previous day"
              className="w-8 h-8 flex items-center justify-center rounded border dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              ‹
            </button>

            <div className="relative">
              <span className="inline-block min-w-[7rem] text-center border dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white cursor-pointer select-none">
                {day ? ddmmyyyy(day) : 'All dates'}
              </span>
              {/* transparent native picker overlay (click the label to open) */}
              <input
                type="date"
                value={day}
                max={todayISO()}
                onChange={(e) => setDay(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                aria-label="Pick a date"
              />
            </div>

            <button
              onClick={() => setDay((d) => (d ? shiftDay(d, 1) : todayISO()))}
              aria-label="Next day"
              className="w-8 h-8 flex items-center justify-center rounded border dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              ›
            </button>

            {day && (
              <button
                onClick={() => setDay('')}
                className="ml-1 text-xs text-brand-600 hover:underline"
              >
                All dates
              </button>
            )}
          </div>

          {/* Status filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            {STATUSES.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center text-gray-400 py-12">Loading…</div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">Order</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">Customer</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">Type</th>
                <th className="px-4 py-3 text-right font-medium text-gray-700 dark:text-gray-300">Total</th>
                <th className="px-4 py-3 text-center font-medium text-gray-700 dark:text-gray-300">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {visibleOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    No orders{day ? ` on ${ddmmyyyy(day)}` : ''}.
                  </td>
                </tr>
              ) : (
                visibleOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">#{order.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{ddmmyyyy(localDay(order.createdAt))}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {(order as any).user?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{order.type}</td>
                    <td className="px-4 py-3 text-right font-semibold dark:text-white">{formatCurrency(order.total)}</td>
                    <td className="px-4 py-3 text-center"><OrderStatusBadge status={order.status} /></td>
                    <td className="px-4 py-3 text-right">
                      {NEXT_STATUS[order.status] && (
                        <button
                          onClick={() => updateStatus({ id: order.id, status: NEXT_STATUS[order.status] })}
                          className="text-xs text-brand-600 hover:underline"
                        >
                          → {NEXT_STATUS[order.status].replace(/_/g, ' ')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
