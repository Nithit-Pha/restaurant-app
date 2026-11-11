'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useCancelMyOrderMutation, useGetOrderQuery, type Order, type OrderStatus } from '../../../src/api/apiSlice';
import OrderStatusBadge from '../../../src/features/orders/OrderStatusBadge';
import PaymentBadge, { paymentMethodText } from '../../../src/features/orders/PaymentBadge';
import PromptPayPanel from '../../../src/features/orders/PromptPayPanel';
import {
  CANCEL_REASON_LABELS,
  formatClock,
  formatOrderNumber,
  statusLabel,
} from '../../../src/features/orders/orderDisplay';
import { formatCurrency, formatDate } from '../../../src/lib/format';
import { useRequireAuth } from '../../../src/routes/useAuthGuard';

function stepsFor(type: Order['type']): OrderStatus[] {
  return type === 'DELIVERY'
    ? ['PENDING', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED']
    : ['PENDING', 'PREPARING', 'READY', 'DELIVERED'];
}

/** Received → Preparing → Ready → (On the way →) Done */
function ProgressSteps({ order }: { order: Order }) {
  const steps = stepsFor(order.type);
  const current = steps.indexOf(order.status);
  const short: Record<string, string> = {
    PENDING: 'Received',
    PREPARING: 'Preparing',
    READY: 'Ready',
    OUT_FOR_DELIVERY: 'On the way',
    DELIVERED: order.type === 'PICKUP' ? 'Picked up' : 'Delivered',
  };
  return (
    <ol className="flex items-center gap-1 mt-4" aria-label="Order progress">
      {steps.map((s, i) => {
        const done = i <= current;
        return (
          <li key={s} className="flex-1 min-w-0">
            <div className={`h-1.5 rounded-full ${done ? 'bg-brand-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
            <p className={`mt-1 text-[11px] truncate ${i === current ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
              {short[s]}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

export default function OrderDetailPage() {
  const { ready } = useRequireAuth();
  const params = useParams<{ id: string }>();
  const orderId = params?.id ?? '';
  // Poll so the customer sees the kitchen's progress without reloading.
  const { data: order, isLoading, error } = useGetOrderQuery(orderId, { skip: !ready || !orderId, pollingInterval: 15000 });
  const [cancelOrder, { isLoading: cancelling, error: cancelError }] = useCancelMyOrderMutation();
  const [confirming, setConfirming] = useState(false);

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

  const cancelMessage = (cancelError as { data?: { message?: string } } | undefined)?.data?.message;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/orders" className="text-sm text-brand-600 hover:underline">← Back to my orders</Link>

      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Order {formatOrderNumber(order)}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Placed {formatDate(order.createdAt)}</p>
        </div>
        <OrderStatusBadge status={order.status} type={order.type} />
      </div>

      {/* Progress + what happens next */}
      <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
        {order.status === 'CANCELLED' ? (
          <div>
            <p className="font-medium text-red-600 dark:text-red-400">This order was cancelled.</p>
            {order.cancelReason && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Reason: {CANCEL_REASON_LABELS[order.cancelReason]}
                {order.cancelNote ? ` — ${order.cancelNote}` : ''}
              </p>
            )}
          </div>
        ) : (
          <>
            <p className="font-medium text-gray-900 dark:text-white">{statusLabel(order.status, order.type)}</p>
            {order.status === 'PREPARING' && order.estimatedReadyAt && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Estimated ready at <span className="font-semibold">{formatClock(order.estimatedReadyAt)}</span>
              </p>
            )}
            {order.status === 'PENDING' && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">The restaurant will confirm your order shortly.</p>
            )}
            <ProgressSteps order={order} />
          </>
        )}

        {order.status === 'PENDING' && (
          <div className="mt-4 border-t dark:border-gray-700 pt-3">
            {confirming ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-700 dark:text-gray-300">Cancel this order?</span>
                <button
                  onClick={async () => {
                    try { await cancelOrder({ id: order.id }).unwrap(); } catch { /* message shown below */ }
                    setConfirming(false);
                  }}
                  disabled={cancelling}
                  className="text-sm bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded disabled:opacity-50"
                >
                  {cancelling ? 'Cancelling…' : 'Yes, cancel'}
                </button>
                <button onClick={() => setConfirming(false)} className="text-sm px-3 py-1.5 rounded border dark:border-gray-600 dark:text-gray-300">
                  Keep order
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirming(true)} className="text-sm text-red-600 dark:text-red-400 hover:underline">
                Cancel order
              </button>
            )}
            {cancelMessage && <p className="text-sm text-red-500 mt-2">{cancelMessage}</p>}
          </div>
        )}
      </div>

      {/* Payment */}
      <section aria-label="Payment" className="mt-4 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="font-medium text-gray-700 dark:text-gray-300">Payment · {paymentMethodText(order)}</p>
          <PaymentBadge order={order} withMethod={false} />
        </div>
        {order.paymentMethod === 'PROMPTPAY' ? (
          <PromptPayPanel order={order} />
        ) : order.paymentStatus === 'PAID' ? (
          <p className="text-sm text-green-700 dark:text-green-400">Paid. Thank you!</p>
        ) : order.paymentStatus === 'REFUNDED' ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">Your payment was refunded.</p>
        ) : order.status !== 'CANCELLED' ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Please have {formatCurrency(order.total)} ready {order.type === 'DELIVERY' ? 'for the rider' : 'when you pick up'}.
          </p>
        ) : null}
      </section>

      <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 space-y-1">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          <span className="font-medium text-gray-700 dark:text-gray-300">Order type:</span>{' '}
          {order.type === 'DELIVERY' ? 'Delivery' : 'Pickup'}
        </p>
        {order.customerPhone && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium text-gray-700 dark:text-gray-300">Phone:</span> {order.customerPhone}
          </p>
        )}
        {order.type === 'DELIVERY' && order.deliveryAddress && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
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
          <div className="flex justify-between"><span>Tax (included)</span><span>{formatCurrency(order.taxAmount)}</span></div>
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
