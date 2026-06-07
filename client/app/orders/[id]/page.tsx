'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useGetOrderQuery } from '../../../src/api/apiSlice';
import OrderStatusBadge from '../../../src/features/orders/OrderStatusBadge';
import { formatCurrency, formatDate } from '../../../src/lib/format';
import { useRequireAuth } from '../../../src/routes/useAuthGuard';

export default function OrderDetailPage() {
  const { ready } = useRequireAuth();
  const params = useParams<{ id: string }>();
  const orderId = params?.id ?? '';
  const { data: order, isLoading, error } = useGetOrderQuery(orderId, { skip: !ready || !orderId });

  if (!ready) return null;
  if (isLoading) return <div className="p-8 text-center text-gray-400">Loading order…</div>;

  if (error || !order) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-500 dark:text-gray-400">We couldn&apos;t find that order.</p>
        <Link href="/orders" className="text-brand-600 hover:underline text-sm font-medium mt-3 inline-block">
          ← Back to my orders
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/orders" className="text-sm text-brand-600 hover:underline">← Back to my orders</Link>

      <div className="mt-3 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Order #{order.id.slice(0, 8)}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Placed {formatDate(order.createdAt)}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          <span className="font-medium text-gray-700 dark:text-gray-300">Order type:</span>{' '}
          {order.type === 'DELIVERY' ? 'Delivery' : 'Pickup'}
        </p>
        {order.type === 'DELIVERY' && order.deliveryAddress && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            <span className="font-medium text-gray-700 dark:text-gray-300">Delivery address:</span>{' '}
            {order.deliveryAddress}
          </p>
        )}
      </div>

      <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
        <p className="font-medium text-gray-700 dark:text-gray-300 mb-3">Items</p>
        <div className="space-y-2">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
              <span>{item.nameSnapshot} × {item.quantity}</span>
              <span>{formatCurrency(item.unitPrice * item.quantity)}</span>
            </div>
          ))}
        </div>
        <div className="border-t dark:border-gray-700 mt-3 pt-3 space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(order.subtotal)}</span></div>
          <div className="flex justify-between"><span>Tax</span><span>{formatCurrency(order.taxAmount)}</span></div>
          {order.deliveryFee > 0 && (
            <div className="flex justify-between"><span>Delivery fee</span><span>{formatCurrency(order.deliveryFee)}</span></div>
          )}
          <div className="flex justify-between font-semibold text-gray-900 dark:text-white text-base pt-1 border-t dark:border-gray-700">
            <span>Total</span><span>{formatCurrency(order.total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
