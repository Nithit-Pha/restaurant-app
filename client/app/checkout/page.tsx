'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '../../src/app/hooks';
import { selectCartItems, clearCart } from '../../src/features/cart/cartSlice';
import { usePlaceOrderMutation, useQuoteOrderMutation, type PricingResult } from '../../src/api/apiSlice';
import DeliveryForm from '../../src/features/checkout/DeliveryForm';
import { formatCurrency } from '../../src/lib/format';
import { useRequireAuth } from '../../src/routes/useAuthGuard';

/** Pull the server's `{ message }` out of an RTK Query error, if there is one. */
function errorMessage(err: unknown, fallback: string): string {
  const msg = (err as { data?: { message?: unknown } } | undefined)?.data?.message;
  return typeof msg === 'string' && msg ? msg : fallback;
}

export default function CheckoutPage() {
  const { ready } = useRequireAuth();
  const dispatch = useAppDispatch();
  const router = useRouter();
  const items = useAppSelector(selectCartItems);
  const [orderType, setOrderType] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  // Customer's location from the browser (option A). Only sent for delivery.
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [placeOrder, { isLoading, error }] = usePlaceOrderMutation();

  // Prices always come from the server (POST /orders/quote) — the same
  // calculation used when the order is placed, so the total shown here is
  // exactly what the customer is charged.
  const [requestQuote] = useQuoteOrderMutation();
  const [quote, setQuote] = useState<PricingResult | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [quoting, setQuoting] = useState(false);

  const cartLines = useMemo(
    () => items.map((i) => ({ menuItemId: i.id, quantity: i.quantity })),
    [items],
  );
  const cartKey = JSON.stringify(cartLines);
  const location = orderType === 'DELIVERY' && coords
    ? { deliveryLat: coords.lat, deliveryLng: coords.lng }
    : {};
  const locationKey = orderType === 'DELIVERY' && coords ? `${coords.lat},${coords.lng}` : '';

  const shareLocation = () => {
    setLocationError('');
    if (!('geolocation' in navigator)) {
      setLocationError('Your browser cannot share a location. Please choose pickup or try another browser.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocationError('Could not get your location. Please allow location access and try again.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  useEffect(() => {
    if (!ready || cartLines.length === 0) return;
    let cancelled = false; // ignore answers to an older cart/order type
    setQuoting(true);
    setQuoteError('');
    requestQuote({ items: cartLines, type: orderType, ...location })
      .unwrap()
      .then((q) => { if (!cancelled) setQuote(q); })
      .catch((err) => {
        if (cancelled) return;
        setQuote(null);
        setQuoteError(errorMessage(err, 'Could not calculate the price. Please try again.'));
      })
      .finally(() => { if (!cancelled) setQuoting(false); });
    return () => { cancelled = true; };
    // cartKey stands in for cartLines' contents
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, cartKey, orderType, locationKey, requestQuote]);

  if (!ready) return null;

  if (items.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="text-gray-500 dark:text-gray-400">Your cart is empty.</p>
      </div>
    );
  }

  const handleSubmit = async () => {
    try {
      const order = await placeOrder({
        items: cartLines,
        type: orderType,
        deliveryAddress: orderType === 'DELIVERY' ? deliveryAddress.trim() : undefined,
        ...location,
      }).unwrap();
      dispatch(clearCart());
      router.push(`/orders/${order.id}`);
    } catch (_) {}
  };

  const canSubmit =
    !!quote && !quoting && !isLoading && (orderType === 'PICKUP' || !!deliveryAddress.trim());

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Checkout</h1>

      {/* Order type */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 mb-4">
        <p className="font-medium text-gray-700 dark:text-gray-300 mb-3">Order type</p>
        <div className="flex gap-4">
          {(['PICKUP', 'DELIVERY'] as const).map((type) => (
            <label key={type} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value={type}
                checked={orderType === type}
                onChange={() => setOrderType(type)}
                className="accent-brand-500"
              />
              <span className="text-sm font-medium dark:text-gray-300">{type === 'PICKUP' ? 'Pickup' : 'Delivery'}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Delivery address */}
      {orderType === 'DELIVERY' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 mb-4">
          <DeliveryForm
            address={deliveryAddress}
            onChange={setDeliveryAddress}
            onUseLocation={shareLocation}
            locating={locating}
            located={!!coords}
            locationError={locationError}
          />
        </div>
      )}

      {/* Order summary */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 mb-6">
        <p className="font-medium text-gray-700 dark:text-gray-300 mb-3">Order summary</p>
        {items.map((item) => (
          <div key={item.id} className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
            <span>{item.name} × {item.quantity}</span>
            <span>{formatCurrency(item.sellingPrice * item.quantity)}</span>
          </div>
        ))}
        <div className="border-t dark:border-gray-700 mt-3 pt-3 space-y-1 text-sm text-gray-600 dark:text-gray-400">
          {quoting && !quote ? (
            <p className="text-gray-400">Calculating…</p>
          ) : quote ? (
            <>
              <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(quote.subtotal)}</span></div>
              <div className="flex justify-between">
                <span>Tax ({Math.round(Number(quote.taxRate) * 10000) / 100}%, included)</span>
                <span>{formatCurrency(quote.taxAmount)}</span>
              </div>
              {orderType === 'DELIVERY' && (
                <div className="flex justify-between"><span>Delivery fee</span><span>{formatCurrency(quote.deliveryFee)}</span></div>
              )}
              <div className="flex justify-between font-semibold text-gray-900 dark:text-white text-base pt-1 border-t dark:border-gray-700">
                <span>Total</span><span>{formatCurrency(quote.total)}</span>
              </div>
            </>
          ) : null}
          {quoteError && <p className="text-red-500">{quoteError}</p>}
        </div>
      </div>

      {error && (
        <p className="text-red-500 text-sm mb-3">{errorMessage(error, 'Failed to place order. Please try again.')}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-3 rounded-lg disabled:opacity-50"
      >
        {isLoading
          ? 'Placing order…'
          : quote && !quoting
            ? `Place order · ${formatCurrency(quote.total)}`
            : 'Calculating total…'}
      </button>
    </div>
  );
}
