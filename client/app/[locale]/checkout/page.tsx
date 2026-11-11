'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { Banknote, Bike, QrCode, ShoppingBag, Store, type LucideIcon } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../../src/app/hooks';
import { selectCartItems, clearCart } from '../../../src/features/cart/cartSlice';
import {
  useCreateAddressMutation,
  useGetMeQuery,
  useGetOpenStatusQuery,
  useGetPaymentOptionsQuery,
  usePlaceOrderMutation,
  useQuoteOrderMutation,
  type PaymentMethod,
  type PricingResult,
} from '../../../src/api/apiSlice';
import ClosedBanner from '../../../src/features/orders/ClosedBanner';
import LineDetails from '../../../src/features/orders/LineDetails';
import DeliveryForm, { deliveryAddressText, emptyDelivery, type DeliveryDraft } from '../../../src/features/checkout/DeliveryForm';
import { formatCurrency } from '../../../src/lib/format';
import { apiErrorMessage, itemName } from '../../../src/lib/localized';
import { useRequireAuth } from '../../../src/routes/useAuthGuard';
import {
  Alert, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, PageContainer, PageHeader, buttonClasses, checkboxClasses, cn,
  useToast,
} from '../../../src/components/ui';

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
  const t = useTranslations('checkout');
  const locale = useLocale();
  const td = useTranslations('delivery');
  const tc = useTranslations('cart');
  const { ready } = useRequireAuth();
  const dispatch = useAppDispatch();
  const router = useRouter();
  const items = useAppSelector(selectCartItems);
  const [orderType, setOrderType] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
  // Address text, driver note and map pin. The pin is only sent for delivery.
  const [delivery, setDelivery] = useState<DeliveryDraft>(() => emptyDelivery(td('defaultLabel')));
  // Bumped when the pin is set from outside the map, so the map centres on it.
  const [mapFocus, setMapFocus] = useState(0);
  const changeDelivery = (next: DeliveryDraft, recenter = false) => {
    setDelivery(next);
    if (recenter) setMapFocus((n) => n + 1);
  };
  const coords = delivery.pin;
  const deliveryAddress = deliveryAddressText(delivery);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [placeOrder, { isLoading, error }] = usePlaceOrderMutation();
  const [createAddress] = useCreateAddressMutation();
  const toast = useToast();
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
  const [quoteError, setQuoteError] = useState<unknown>(null);
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
      setLocationError(td('noGeolocation'));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDelivery((d) => ({ ...d, pin: { lat: pos.coords.latitude, lng: pos.coords.longitude } }));
        setMapFocus((n) => n + 1);
        setLocating(false);
      },
      () => {
        setLocationError(td('locationFailed'));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // One idempotency key per checkout attempt. A double click or a retry after a
  // network error sends the same key, so the server never creates two orders.
  // Any change to what is being ordered starts a new attempt.
  const attemptKey = `${cartKey}|${orderType}|${locationKey}|${deliveryAddress}|${phone.trim()}|${method}`;
  const [idempotencyKey, setIdempotencyKey] = useState(newUuid);
  useEffect(() => { setIdempotencyKey(newUuid()); }, [attemptKey]);

  useEffect(() => {
    if (!ready || cartLines.length === 0) return;
    let cancelled = false; // ignore answers to an older cart/order type
    setQuoting(true);
    setQuoteError(null);
    requestQuote({ items: cartLines, type: orderType, ...location })
      .unwrap()
      .then((q) => { if (!cancelled) setQuote(q); })
      .catch((err) => {
        if (cancelled) return;
        setQuote(null);
        setQuoteError(err);
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
        <PageHeader title={t('title')} />
        <Card>
          <EmptyState
            icon={ShoppingBag}
            title={t('emptyTitle')}
            description={t('emptyDescription')}
            action={<Link href="/menu" className={buttonClasses('primary')}>{tc('browseMenu')}</Link>}
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
        deliveryAddress: orderType === 'DELIVERY' ? deliveryAddress : undefined,
        customerPhone: phone.trim(),
        idempotencyKey,
        paymentMethod: method,
        ...location,
      }).unwrap();
      dispatch(clearCart());
      // The order is placed either way; a failed save only costs a toast.
      if (orderType === 'DELIVERY' && delivery.savedId === null && delivery.save && delivery.pin) {
        const label = delivery.label.trim() || td('fallbackLabel');
        try {
          await createAddress({ label, text: delivery.text.trim(), note: delivery.note.trim() || null, ...delivery.pin }).unwrap();
          toast({ title: t('addressSaved', { label }) });
        } catch {
          toast({ tone: 'error', title: t('addressNotSaved') });
        }
      }
      router.push(`/orders/${order.id}`);
    } catch (_) {}
  };

  // Delivery needs both the address for the driver and the pin for the fee.
  const deliveryMissing = orderType === 'DELIVERY' && (!delivery.text.trim() ? 'address' : !delivery.pin ? 'pin' : null);
  const canSubmit = !!quote && !quoting && !isLoading && !isClosed && phoneValid && !deliveryMissing;

  const phoneError = phone && !phoneValid ? t('phoneInvalid') : undefined;

  return (
    <PageContainer>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <ClosedBanner className="mb-5" />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          {/* Order type */}
          <Card>
            <CardHeader title={t('howTitle')} />
            <CardBody>
              <div role="radiogroup" aria-label={t('orderType')} className="grid gap-3 sm:grid-cols-2">
                <ChoiceCard
                  name="orderType"
                  checked={orderType === 'PICKUP'}
                  onChange={() => setOrderType('PICKUP')}
                  icon={Store}
                  title={t('pickup')}
                  description={t('pickupDescription')}
                />
                <ChoiceCard
                  name="orderType"
                  checked={orderType === 'DELIVERY'}
                  onChange={() => setOrderType('DELIVERY')}
                  icon={Bike}
                  title={t('delivery')}
                  description={t('deliveryDescription')}
                />
              </div>
            </CardBody>
          </Card>

          {/* Contact + address */}
          <Card>
            <CardHeader title={orderType === 'DELIVERY' ? t('contactAndAddress') : t('contact')} />
            <CardBody className="space-y-5">
              <Field
                label={t('phone')}
                htmlFor="phone"
                required
                error={phoneError}
                hint={t('phoneHint')}
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
                  value={delivery}
                  onChange={changeDelivery}
                  focusKey={mapFocus}
                  onUseLocation={shareLocation}
                  locating={locating}
                  locationError={locationError}
                />
              )}
            </CardBody>
          </Card>

          {/* Payment */}
          <Card>
            <CardHeader title={t('payment')} />
            <CardBody>
              <fieldset>
                <legend className="sr-only">{t('payment')}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ChoiceCard
                    name="payment"
                    checked={method === 'CASH'}
                    onChange={() => setPaymentMethod('CASH')}
                    icon={Banknote}
                    title={orderType === 'DELIVERY' ? t('cashOnDelivery') : t('cashAtPickup')}
                  />
                  {paymentOptions?.promptPay && (
                    <ChoiceCard
                      name="payment"
                      checked={method === 'PROMPTPAY'}
                      onChange={() => setPaymentMethod('PROMPTPAY')}
                      icon={QrCode}
                      title={t('promptPay')}
                      description={t('promptPayDescription')}
                    />
                  )}
                </div>
              </fieldset>
            </CardBody>
          </Card>
        </div>

        {/* Order summary — stays in view on wide screens */}
        <Card className="lg:sticky lg:top-[4.5rem]">
          <CardHeader title={t('summary')} />
          <CardBody className="space-y-4">
            <ul className="space-y-2 text-sm">
              {items.map((item) => (
                <li key={item.lineId} className="flex justify-between gap-3">
                  <span className="text-fg">
                    <span className="mr-1.5 font-medium tabular-nums">{item.quantity}×</span>
                    {itemName(item, locale)}
                    <LineDetails options={item.options} note={item.note} className="ml-6" />
                  </span>
                  <span className="tabular-nums text-fg-muted">{formatCurrency(item.sellingPrice * item.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="space-y-1.5 border-t border-line pt-3 text-sm text-fg-muted">
              {quoting && !quote ? (
                <p>{t('calculating')}</p>
              ) : quote ? (
                <>
                  <div className="flex justify-between"><span>{tc('subtotal')}</span><span className="tabular-nums">{formatCurrency(quote.subtotal)}</span></div>
                  <div className="flex justify-between">
                    <span>{t('taxIncluded', { rate: Math.round(Number(quote.taxRate) * 10000) / 100 })}</span>
                    <span className="tabular-nums">{formatCurrency(quote.taxAmount)}</span>
                  </div>
                  {orderType === 'DELIVERY' && (
                    <div className="flex justify-between"><span>{t('deliveryFee')}</span><span className="tabular-nums">{formatCurrency(quote.deliveryFee)}</span></div>
                  )}
                  <div className="flex justify-between border-t border-line pt-2 text-base font-semibold text-fg">
                    <span>{tc('total')}</span><span className="tabular-nums">{formatCurrency(quote.total)}</span>
                  </div>
                </>
              ) : null}
              {quoteError !== null && <p className="text-danger">{apiErrorMessage(quoteError, locale, t('quoteFailed'))}</p>}
            </div>

            {error && <Alert tone="danger">{apiErrorMessage(error, locale, t('placeFailed'))}</Alert>}

            <Button size="lg" fullWidth onClick={handleSubmit} disabled={!canSubmit} loading={isLoading}>
              {isClosed
                ? openStatus?.closedReason === 'PAUSED' ? t('pausedButton') : t('closedButton')
                : isLoading
                ? t('placing')
                : quote && !quoting
                  ? t('placeOrder', { total: formatCurrency(quote.total) })
                  : t('calculatingTotal')}
            </Button>
            {!isClosed && (!phoneValid || deliveryMissing) && (
              <p className="text-center text-xs text-fg-muted">
                {!phoneValid
                  ? t('needPhone')
                  : deliveryMissing === 'address'
                    ? t('needAddress')
                    : t('needPin')}
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </PageContainer>
  );
}
