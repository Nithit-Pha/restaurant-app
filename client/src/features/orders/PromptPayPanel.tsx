'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import QRCode from 'qrcode';
import { CheckCircle2, Clock, Undo2 } from 'lucide-react';
import { useGetPromptPayQrQuery, useReportPaymentSentMutation, type Order } from '../../api/apiSlice';
import { formatCurrency } from '../../lib/format';
import { apiErrorMessage } from '../../lib/localized';
import { Alert, Button, Spinner } from '../../components/ui';

/**
 * The customer's PromptPay payment: a QR with the exact amount, then
 * "I've transferred" so staff know to check their bank app.
 */
export default function PromptPayPanel({ order }: { order: Order }) {
  const t = useTranslations('promptPay');
  const locale = useLocale();
  const waiting = order.paymentStatus === 'UNPAID' || order.paymentStatus === 'PENDING';
  const { data: qr, error } = useGetPromptPayQrQuery(order.id, { skip: !waiting || order.status === 'CANCELLED' });
  const [reportSent, { isLoading: sending, error: sendError }] = useReportPaymentSentMutation();
  const [image, setImage] = useState('');

  useEffect(() => {
    if (!qr?.payload) return;
    let cancelled = false;
    QRCode.toDataURL(qr.payload, { margin: 1, width: 240, errorCorrectionLevel: 'M' })
      .then((url) => { if (!cancelled) setImage(url); })
      .catch(() => { if (!cancelled) setImage(''); });
    return () => { cancelled = true; };
  }, [qr?.payload]);

  if (order.paymentStatus === 'PAID') {
    return (
      <p className="flex items-center gap-2 font-medium text-success">
        <CheckCircle2 size={18} strokeWidth={1.75} aria-hidden />
        {t('received')}
      </p>
    );
  }
  if (order.paymentStatus === 'REFUNDED') {
    return (
      <p className="flex items-center gap-2 font-medium text-fg">
        <Undo2 size={18} strokeWidth={1.75} aria-hidden />
        {t('refunded')}
      </p>
    );
  }
  if (order.status === 'CANCELLED') {
    return <p className="text-sm text-fg-muted">{t('cancelled')}</p>;
  }

  const steps = [
    <>{t('stepScan')}</>,
    <>
      {t.rich('stepCheck', {
        name: qr?.promptPayName || t('theRestaurant'),
        amount: formatCurrency(order.total),
        b: (chunks) => <span className="font-semibold text-fg">{chunks}</span>,
      })}
    </>,
    <>{t('stepConfirm')}</>,
  ];

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
      {/* The QR stays on white in both themes so banking apps can read it. */}
      <div className="flex h-[248px] w-[248px] shrink-0 items-center justify-center rounded-card border border-line bg-white p-1">
        {image ? (
          <img src={image} alt={t('qrAlt', { amount: formatCurrency(order.total) })} width={240} height={240} />
        ) : error ? (
          <span className="px-4 text-center text-sm text-danger">{apiErrorMessage(error, locale, t('qrFailed'))}</span>
        ) : (
          <Spinner label={t('loadingQr')} />
        )}
      </div>
      <div className="w-full space-y-4 text-sm text-fg">
        <p className="text-2xl font-semibold tabular-nums tracking-tight">{t('pay', { amount: formatCurrency(order.total) })}</p>
        <ol className="space-y-2">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-fg-muted">
                {i + 1}
              </span>
              <span className="text-fg-muted">{step}</span>
            </li>
          ))}
        </ol>
        {order.paymentStatus === 'PENDING' ? (
          <div className="flex items-center gap-2 rounded-card bg-warning-soft px-3 py-2.5 text-warning">
            <Clock size={16} strokeWidth={1.75} aria-hidden className="shrink-0" />
            <span>{t('checking')}</span>
          </div>
        ) : (
          <Button size="lg" onClick={() => { void reportSent(order.id); }} loading={sending} disabled={!qr}>
            {t('transferred')}
          </Button>
        )}
        {sendError && <Alert tone="danger">{apiErrorMessage(sendError, locale, t('confirmationFailed'))}</Alert>}
      </div>
    </div>
  );
}
