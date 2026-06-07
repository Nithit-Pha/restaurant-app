import { useState } from 'react';
import { useGetAdminOrdersQuery, useUpdateOrderStatusMutation } from '../../api/apiSlice';
import OrderStatusBadge from '../orders/OrderStatusBadge';
import { formatCurrency } from '../../lib/format';

const STATUSES = ['', 'PENDING', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];
const NEXT_STATUS: Record<string, string> = {
  PENDING: 'PREPARING',
  PREPARING: 'OUT_FOR_DELIVERY',
  OUT_FOR_DELIVERY: 'DELIVERED',
};

export default function AdminOrdersPage() {
  const [filterStatus, setFilterStatus] = useState('');
  const { data: orders = [], isLoading } = useGetAdminOrdersQuery(
    { status: filterStatus || undefined },
    { pollingInterval: 15000 }
  );
  const [updateStatus] = useUpdateOrderStatusMutation();

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Orders</h1>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        >
          {STATUSES.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="text-center text-gray-400 py-12">Loading…</div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">Order</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">Customer</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">Type</th>
                <th className="px-4 py-3 text-right font-medium text-gray-700 dark:text-gray-300">Total</th>
                <th className="px-4 py-3 text-center font-medium text-gray-700 dark:text-gray-300">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">#{order.id.slice(0, 8)}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
