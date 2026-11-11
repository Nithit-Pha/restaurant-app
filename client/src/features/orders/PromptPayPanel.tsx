'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useGetPromptPayQrQuery, useReportPaymentSentMutation, type Order } from '../../api/apiSlice';
import { formatCurrency } from '../../lib/format';

/**
 * The customer's PromptPay payment: a QR with the exact amount, then
 * "I've transferred" so staff know to check their bank app.
 */
export default function PromptPayPanel({ order }: { order: Order }) {
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
    return <p className="font-medium text-green-700 dark:text-green-400">Payment received. Thank you!</p>;
  }
  if (order.paymentStatus === 'REFUNDED') {
    return <p className="font-medium text-gray-700 dark:text-gray-300">Your payment was refunded.</p>;
  }
  if (order.status === 'CANCELLED') {
    return <p className="text-sm text-gray-600 dark:text-gray-400">This order was cancelled, so there is nothing to pay.</p>;
  }

  const errorText = (e: unknown) => (e as { data?: { message?: string } } | undefined)?.data?.message;

  return (
    <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
      <div className="w-[240px] h-[240px] shrink-0 rounded-lg border dark:border-gray-700 bg-white flex items-center justify-center">
        {image ? (
          <img src={image} alt={`PromptPay QR code for ${formatCurrency(order.total)}`} width={240} height={240} />
        ) : (
          <span className="text-sm text-gray-400 px-4 text-center">{errorText(error) ?? 'Loading QR…'}</span>
        )}
      </div>
      <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2">
        <p className="text-lg font-semibold text-gray-900 dark:text-white">Pay {formatCurrency(order.total)}</p>
        <ol className="list-decimal ml-4 space-y-1">
          <li>Open your banking app and scan this QR code (or save it and use “scan from image”).</li>
          <li>
            Check the name shown is <span className="font-semibold">{qr?.promptPayName || 'the restaurant'}</span>
            {' '}and the amount is {formatCurrency(order.total)}.
          </li>
          <li>Confirm the transfer, then tap the button below.</li>
        </ol>
        {order.paymentStatus === 'PENDING' ? (
          <p className="rounded bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 px-3 py-2">
            Thanks! The restaurant is checking your transfer.
          </p>
        ) : (
          <button
            type="button"
            onClick={() => { void reportSent(order.id); }}
            disabled={sending || !qr}
            className="min-h-[44px] px-4 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-semibold disabled:opacity-50"
          >
            {sending ? 'Sending…' : "I've transferred the money"}
          </button>
        )}
        {errorText(sendError) && <p className="text-red-500">{errorText(sendError)}</p>}
      </div>
    </div>
  );
}
