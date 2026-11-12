'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, Banknote, Check, CheckCircle2, Clock, SearchX, Undo2, XCircle } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { apiErrorMessage } from '@/lib/localized';
import { useCancelMyOrderMutation, useGetOrderQuery, type Order, type OrderStatus } from '../../../../src/api/apiSlice';
import OrderStatusBadge from '../../../../src/features/orders/OrderStatusBadge';
import PaymentBadge from '../../../../src/features/orders/PaymentBadge';
import PromptPayPanel from '../../../../src/features/orders/PromptPayPanel';
import LineDetails from '../../../../src/features/orders/LineDetails';
import { useOrderLabels } from '../../../../src/features/orders/useOrderLabels';
import { formatClock, formatOrderNumber } from '../../../../src/features/orders/orderDisplay';
import { formatCurrency, formatDate } from '../../../../src/lib/format';
import { useRequireAuth } from '../../../../src/routes/useAuthGuard';
import {
  Alert, Button, Card, CardBody, CardHeader, Dialog, EmptyState, LoadingBlock, PageContainer, buttonClasses, cn,
} from '../../../../src/components/ui';
import OrderProgress from '../../../../src/features/orders/OrderProgress';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="text-right text-fg">{children}</dd>
    </div>
  );
}

export default function OrderDetailPage() {
  const t = useTranslations('orderPage');
  const to = useTranslations('order');
  const tc = useTranslations('checkout');
  const tcart = useTranslations('cart');
  const locale = useLocale();
  const labels = useOrderLabels();
  const { ready } = useRequireAuth();
  const params = useParams<{ id: string }>();
  const orderId = params?.id ?? '';
  // Poll so the customer sees the kitchen's progress without reloading.
  const { data: order, isLoading, error } = useGetOrderQuery(orderId, { skip: !ready || !orderId, pollingInterval: 15000 });
  const [cancelOrder, { isLoading: cancelling, error: cancelError }] = useCancelMyOrderMutation();
  const [confirming, setConfirming] = useState(false);

  if (!ready) return null;
  if (isLoading) {
    return (
      <PageContainer>
        <LoadingBlock label={t('loading')} />
      </PageContainer>
    );
  }

  if (error || !order) {
    return (
      <PageContainer>
        <Card>
          <EmptyState
            icon={SearchX}
            title={t('notFound')}
            action={<Link href="/orders" className={buttonClasses('secondary')}>{t('backToOrders')}</Link>}
          />
        </Card>
      </PageContainer>
    );
  }


  return (
    <PageContainer>
      <Link href="/orders" className="inline-flex items-center gap-1.5 text-sm font-medium text-fg-muted hover:text-fg">
        <ArrowLeft size={16} strokeWidth={1.75} aria-hidden />
        {t('myOrders')}
      </Link>

      <header className="mb-6 mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">{to('number', { number: formatOrderNumber(order) })}</h1>
          <p className="mt-1 text-sm text-fg-muted">{t('placed', { date: formatDate(order.createdAt, locale) })}</p>
        </div>
        <OrderStatusBadge status={order.status} type={order.type} />
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          {/* Progress + what happens next */}
          <Card>
            <CardBody className="py-5">
              {order.status === 'CANCELLED' ? (
                <div className="flex gap-3">
                  <XCircle size={22} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-danger" />
                  <div>
                    <p className="font-medium text-fg">{t('cancelled')}</p>
                    {order.cancelReason && (
                      <p className="mt-1 text-sm text-fg-muted">
                        {t('reason', { reason: labels.cancelReason(order.cancelReason) })}
                        {order.cancelNote ? ` — ${order.cancelNote}` : ''}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-lg font-semibold text-fg">{labels.status(order.status, order.type)}</p>
                  {order.status === 'PREPARING' && order.estimatedReadyAt && (
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-fg-muted">
                      <Clock size={15} strokeWidth={1.75} aria-hidden />
                      {t.rich('estimatedReady', {
                        time: formatClock(order.estimatedReadyAt),
                        b: (chunks) => <span className="font-semibold tabular-nums text-fg">{chunks}</span>,
                      })}
                    </p>
                  )}
                  {order.status === 'PENDING' && (
                    <p className="mt-1 text-sm text-fg-muted">{t('confirmSoon')}</p>
                  )}
                  <OrderProgress order={order} className="mt-6" />
                </>
              )}

              {order.status === 'PENDING' && (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
                  <p className="text-sm text-fg-muted">{t('canCancel')}</p>
                  <Button variant="ghost" size="sm" className="!text-danger hover:!bg-danger-soft" onClick={() => setConfirming(true)}>
                    {t('cancelOrder')}
                  </Button>
                </div>
              )}
              {cancelError && <Alert tone="danger" className="mt-3">{apiErrorMessage(cancelError, locale, t('cancelFailed'))}</Alert>}
            </CardBody>
          </Card>

          {/* Payment */}
          <Card>
            <section aria-label={tc('payment')}>
              <CardHeader title={t('paymentTitle', { method: labels.paymentMethodText(order) })} actions={<PaymentBadge order={order} withMethod={false} />} />
              <CardBody>
                {order.paymentMethod === 'PROMPTPAY' ? (
                  <PromptPayPanel order={order} />
                ) : order.paymentStatus === 'PAID' ? (
                  <p className="flex items-center gap-2 font-medium text-success">
                    <CheckCircle2 size={18} strokeWidth={1.75} aria-hidden />
                    {t('paid')}
                  </p>
                ) : order.paymentStatus === 'REFUNDED' ? (
                  <p className="flex items-center gap-2 text-sm text-fg">
                    <Undo2 size={18} strokeWidth={1.75} aria-hidden />
                    {t('refunded')}
                  </p>
                ) : order.status !== 'CANCELLED' ? (
                  <p className="flex items-center gap-2 text-sm text-fg">
                    <Banknote size={18} strokeWidth={1.75} aria-hidden className="text-fg-muted" />
                    <span>
                      {t.rich(order.type === 'DELIVERY' ? 'haveCashRider' : 'haveCashPickup', {
                        amount: formatCurrency(order.total),
                        b: (chunks) => <span className="font-semibold tabular-nums">{chunks}</span>,
                      })}
                    </span>
                  </p>
                ) : (
                  <p className="text-sm text-fg-muted">{t('nothingToPay')}</p>
                )}
              </CardBody>
            </section>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title={t('details')} />
            <CardBody className="py-2">
              <dl className="divide-y divide-line">
                <Row label={tc('orderType')}>{order.type === 'DELIVERY' ? tc('delivery') : tc('pickup')}</Row>
                {order.customerPhone && <Row label={tc('phone')}><span className="tabular-nums">{order.customerPhone}</span></Row>}
                {order.type === 'DELIVERY' && order.deliveryAddress && <Row label={t('deliveryAddress')}>{order.deliveryAddress}</Row>}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t('items')} />
            <CardBody>
              <ul className="space-y-2 text-sm">
                {order.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3">
                    <span className="text-fg">
                      <span className="mr-1.5 font-medium tabular-nums">{item.quantity}×</span>
                      {item.nameSnapshot}
                      <LineDetails options={item.modifiers} note={item.note} className="ml-6" />
                    </span>
                    <span className="tabular-nums text-fg-muted">{formatCurrency(item.unitPrice * item.quantity)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 space-y-1.5 border-t border-line pt-3 text-sm text-fg-muted">
                <div className="flex justify-between"><span>{tcart('subtotal')}</span><span className="tabular-nums">{formatCurrency(order.subtotal)}</span></div>
                <div className="flex justify-between"><span>{t('taxIncluded')}</span><span className="tabular-nums">{formatCurrency(order.taxAmount)}</span></div>
                {order.deliveryFee > 0 && (
                  <div className="flex justify-between"><span>{tc('deliveryFee')}</span><span className="tabular-nums">{formatCurrency(order.deliveryFee)}</span></div>
                )}
                <div className="flex justify-between border-t border-line pt-2 text-base font-semibold text-fg">
                  <span>{tcart('total')}</span><span className="tabular-nums">{formatCurrency(order.total)}</span>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        size="sm"
        title={t('cancelTitle')}
        description={t('cancelDescription')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} data-autofocus>
              {t('keepOrder')}
            </Button>
            <Button
              variant="danger"
              loading={cancelling}
              onClick={async () => {
                try { await cancelOrder({ id: order.id }).unwrap(); } catch { /* message shown on the page */ }
                setConfirming(false);
              }}
            >
              {t('yesCancel')}
            </Button>
          </>
        }
      />
    </PageContainer>
  );
}
