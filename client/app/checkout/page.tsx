'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '../../src/app/hooks';
import { selectCartItems, clearCart } from '../../src/features/cart/cartSlice';
import {
  useGetMeQuery,
  useGetOpenStatusQuery,
  useGetPaymentOptionsQuery,
  usePlaceOrderMutation,
  useQuoteOrderMutation,
  type PaymentMethod,
  type PricingResult,
} from '../../src/api/apiSlice';
import ClosedBanner from '../../src/features/orders/ClosedBanner';
import DeliveryForm from '../../src/features/checkout/DeliveryForm';
import { formatCurrency } from '../../src/lib/format';
import { useRequireAuth } from '../../src/routes/useAuthGuard';

/** A random UUID; crypto.randomUUID only exists on https/localhost. */
function newUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Same rule as the server: digits, spaces, dashes, optional leading +.
const PHONE_RE = /^\+?[0-9][0-9 -]{7,18}$/;

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
  const { data: me } = useGetMeQuery(undefined, { skip: !ready });
  const { data: openStatus } = useGetOpenStatusQuery(undefined, { pollingInterval: 60_000 });
  const isClosed = openStatus ? !openStatus.isOpen : false;
  const { data: paymentOptions } = useGetPaymentOptionsQuery();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  // Fall back to cash if the restaurant switches PromptPay off.
  const method: PaymentMethod = paymentMethod === 'PROMPTPAY' && !paymentOptions?.promptPay ? 'CASH' : paymentMethod;

  // Phone so the restaurant (or rider) can reach the customer. Prefilled from
  // the profile; whatever is used here is saved back to it.
  const [phone, setPhone] = useState('');
  const phoneTouched = useRef(false);
  useEffect(() => {
    if (me?.phone && !phoneTouched.current) setPhone(me.phone);
  }, [me?.phone]);
  const phoneValid = PHONE_RE.test(phone.trim());

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

  // One idempotency key per checkout attempt. A double click or a retry after a
  // network error sends the same key, so the server never creates two orders.
  // Any change to what is being ordered starts a new attempt.
  const attemptKey = `${cartKey}|${orderType}|${locationKey}|${deliveryAddress.trim()}|${phone.trim()}|${method}`;
  const [idempotencyKey, setIdempotencyKey] = useState(newUuid);
  useEffect(() => { setIdempotencyKey(newUuid()); }, [attemptKey]);

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
    if (isLoading) return; // ignore a second click while the first is in flight
    try {
      const order = await placeOrder({
        items: cartLines,
        type: orderType,
        deliveryAddress: orderType === 'DELIVERY' ? deliveryAddress.trim() : undefined,
        customerPhone: phone.trim(),
        idempotencyKey,
        paymentMethod: method,
        ...location,
      }).unwrap();
      dispatch(clearCart());
      router.push(`/orders/${order.id}`);
    } catch (_) {}
  };

  const canSubmit =
    !!quote && !quoting && !isLoading && !isClosed && phoneValid &&
    (orderType === 'PICKUP' || !!deliveryAddress.trim());

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Checkout</h1>
      <ClosedBanner className="mb-4" />

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

      {/* Contact phone */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 mb-4">
        <label htmlFor="phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Phone number
        </label>
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => { phoneTouched.current = true; setPhone(e.target.value); }}
          placeholder="08x xxx xxxx"
          className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <p className={`text-xs mt-1 ${phone && !phoneValid ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
          {phone && !phoneValid ? 'Please enter a valid phone number.' : 'So the restaurant can reach you about this order.'}
        </p>
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

      {/* Payment */}
      <fieldset className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 mb-4">
        <legend className="float-left w-full font-medium text-gray-700 dark:text-gray-300 mb-3">Payment</legend>
        <div className="space-y-2 clear-left">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="payment"
              checked={method === 'CASH'}
              onChange={() => setPaymentMethod('CASH')}
              className="accent-brand-500 mt-1"
            />
            <span className="text-sm dark:text-gray-300">
              <span className="font-medium">{orderType === 'DELIVERY' ? 'Cash on delivery' : 'Cash at pickup'}</span>
            </span>
          </label>
          {paymentOptions?.promptPay && (
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="payment"
                checked={method === 'PROMPTPAY'}
                onChange={() => setPaymentMethod('PROMPTPAY')}
                className="accent-brand-500 mt-1"
              />
              <span className="text-sm dark:text-gray-300">
                <span className="font-medium">PromptPay QR</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">
                  After you order, scan the QR code with your banking app.
                </span>
              </span>
            </label>
          )}
        </div>
      </fieldset>

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
        {isClosed
          ? openStatus?.closedReason === 'PAUSED' ? 'Ordering is paused right now' : 'Ordering is closed right now'
          : isLoading
          ? 'Placing order…'
          : quote && !quoting
            ? `Place order · ${formatCurrency(quote.total)}`
            : 'Calculating total…'}
      </button>
    </div>
  );
}
