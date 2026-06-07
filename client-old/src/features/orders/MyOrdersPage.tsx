import { Link } from 'react-router-dom';
import { useGetMyOrdersQuery } from '../../api/apiSlice';
import OrderStatusBadge from './OrderStatusBadge';
import { formatCurrency } from '../../lib/format';

export default function MyOrdersPage() {
  const { data: orders = [], isLoading } = useGetMyOrdersQuery(undefined, {
    pollingInterval: 15000,
  });

  if (isLoading) return <div className="p-8 text-center text-gray-400">Loading orders…</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">My Orders</h1>
      {orders.length === 0 ? (
        <div className="text-gray-500 dark:text-gray-400 text-center py-12">
          No orders yet. <Link to="/menu" className="text-brand-600 hover:underline">Browse the menu</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <Link key={order.id} to={`/orders/${order.id}`} className="block bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">#{order.id.slice(0, 8)}</span>
                <OrderStatusBadge status={order.status} />
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{order.items.length} item(s) · {order.type}</p>
              <p className="font-semibold text-gray-900 dark:text-white mt-1">{formatCurrency(order.total)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
