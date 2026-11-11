'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Banknote, Bike, QrCode, ShoppingBag, Store, type LucideIcon } from 'lucide-react';
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
import LineDetails from '../../src/features/orders/LineDetails';
import DeliveryForm from '../../src/features/checkout/DeliveryForm';
import { formatCurrency } from '../../src/lib/format';
import { useRequireAuth } from '../../src/routes/useAuthGuard';
import {
  Alert, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, PageContainer, PageHeader, buttonClasses, checkboxClasses, cn,
} from '../../src/components/ui';

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


/** A radio option shown as a selectable card (order type, payment). */
function ChoiceCard({
  name, checked, onChange, icon: Icon, title, description,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  icon: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-card border p-4 transition-colors duration-150',
        checked ? 'border-accent bg-accent-soft/40 ring-1 ring-accent' : 'border-line bg-surface hover:border-line-strong',
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className={cn(checkboxClasses, 'mt-2.5 shrink-0')} />
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-control',
          checked ? 'bg-accent text-accent-fg' : 'bg-surface-muted text-fg-muted',
        )}
      >
        <Icon size={18} strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-fg">{title}</span>
        {description && <span className="mt-0.5 block text-xs text-fg-muted">{description}</span>}
      </span>
    </label>
  );
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
    () => items.map((i) => ({
      menuItemId: i.id,
      quantity: i.quantity,
      modifierIds: i.options.map((o) => o.id),
      ...(i.note ? { note: i.note } : {}),
    })),
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
      <PageContainer>
        <PageHeader title="Checkout" />
        <Card>
          <EmptyState
            icon={ShoppingBag}
            title="Your cart is empty."
            description="Add something from the menu, then come back here to order."
            action={<Link href="/menu" className={buttonClasses('primary')}>Browse the menu</Link>}
          />
        </Card>
      </PageContainer>
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

  const phoneError = phone && !phoneValid ? 'Please enter a valid phone number.' : undefined;

  return (
    <PageContainer>
      <PageHeader title="Checkout" description="Check the details, then place your order." />
      <ClosedBanner className="mb-5" />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          {/* Order type */}
          <Card>
            <CardHeader title="How would you like it?" />
            <CardBody>
              <div role="radiogroup" aria-label="Order type" className="grid gap-3 sm:grid-cols-2">
                <ChoiceCard
                  name="orderType"
                  checked={orderType === 'PICKUP'}
                  onChange={() => setOrderType('PICKUP')}
                  icon={Store}
                  title="Pickup"
                  description="Collect it at the restaurant."
                />
                <ChoiceCard
                  name="orderType"
                  checked={orderType === 'DELIVERY'}
                  onChange={() => setOrderType('DELIVERY')}
                  icon={Bike}
                  title="Delivery"
                  description="We bring it to your door."
                />
              </div>
            </CardBody>
          </Card>

          {/* Contact + address */}
          <Card>
            <CardHeader title={orderType === 'DELIVERY' ? 'Contact and address' : 'Contact'} />
            <CardBody className="space-y-5">
              <Field
                label="Phone number"
                htmlFor="phone"
                required
                error={phoneError}
                hint="So the restaurant can reach you about this order."
              >
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => { phoneTouched.current = true; setPhone(e.target.value); }}
                  placeholder="08x xxx xxxx"
                  aria-invalid={phoneError ? true : undefined}
                  aria-describedby={phoneError ? 'phone-error' : 'phone-hint'}
                  className="sm:max-w-xs"
                />
              </Field>
              {orderType === 'DELIVERY' && (
                <DeliveryForm
                  address={deliveryAddress}
                  onChange={setDeliveryAddress}
                  onUseLocation={shareLocation}
                  locating={locating}
                  located={!!coords}
                  locationError={locationError}
                />
              )}
            </CardBody>
          </Card>

          {/* Payment */}
          <Card>
            <CardHeader title="Payment" />
            <CardBody>
              <fieldset>
                <legend className="sr-only">Payment</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ChoiceCard
                    name="payment"
                    checked={method === 'CASH'}
                    onChange={() => setPaymentMethod('CASH')}
                    icon={Banknote}
                    title={orderType === 'DELIVERY' ? 'Cash on delivery' : 'Cash at pickup'}
                  />
                  {paymentOptions?.promptPay && (
                    <ChoiceCard
                      name="payment"
                      checked={method === 'PROMPTPAY'}
                      onChange={() => setPaymentMethod('PROMPTPAY')}
                      icon={QrCode}
                      title="PromptPay QR"
                      description="After you order, scan the QR code with your banking app."
                    />
                  )}
                </div>
              </fieldset>
            </CardBody>
          </Card>
        </div>

        {/* Order summary — stays in view on wide screens */}
        <Card className="lg:sticky lg:top-[4.5rem]">
          <CardHeader title="Order summary" />
          <CardBody className="space-y-4">
            <ul className="space-y-2 text-sm">
              {items.map((item) => (
                <li key={item.lineId} className="flex justify-between gap-3">
                  <span className="text-fg">
                    <span className="mr-1.5 font-medium tabular-nums">{item.quantity}×</span>
                    {item.name}
                    <LineDetails options={item.options} note={item.note} className="ml-6" />
                  </span>
                  <span className="tabular-nums text-fg-muted">{formatCurrency(item.sellingPrice * item.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="space-y-1.5 border-t border-line pt-3 text-sm text-fg-muted">
              {quoting && !quote ? (
                <p>Calculating…</p>
              ) : quote ? (
                <>
                  <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{formatCurrency(quote.subtotal)}</span></div>
                  <div className="flex justify-between">
                    <span>Tax ({Math.round(Number(quote.taxRate) * 10000) / 100}%, included)</span>
                    <span className="tabular-nums">{formatCurrency(quote.taxAmount)}</span>
                  </div>
                  {orderType === 'DELIVERY' && (
                    <div className="flex justify-between"><span>Delivery fee</span><span className="tabular-nums">{formatCurrency(quote.deliveryFee)}</span></div>
                  )}
                  <div className="flex justify-between border-t border-line pt-2 text-base font-semibold text-fg">
                    <span>Total</span><span className="tabular-nums">{formatCurrency(quote.total)}</span>
                  </div>
                </>
              ) : null}
              {quoteError && <p className="text-danger">{quoteError}</p>}
            </div>

            {error && <Alert tone="danger">{errorMessage(error, 'Failed to place order. Please try again.')}</Alert>}

            <Button size="lg" fullWidth onClick={handleSubmit} disabled={!canSubmit} loading={isLoading}>
              {isClosed
                ? openStatus?.closedReason === 'PAUSED' ? 'Ordering is paused right now' : 'Ordering is closed right now'
                : isLoading
                ? 'Placing order…'
                : quote && !quoting
                  ? `Place order · ${formatCurrency(quote.total)}`
                  : 'Calculating total…'}
            </Button>
            {!isClosed && (!phoneValid || (orderType === 'DELIVERY' && !deliveryAddress.trim())) && (
              <p className="text-center text-xs text-fg-muted">
                {!phoneValid ? 'Add your phone number to place the order.' : 'Add a delivery address to place the order.'}
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </PageContainer>
  );
}
