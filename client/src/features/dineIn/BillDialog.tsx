'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import QRCode from 'qrcode';
import { Banknote, CheckCircle2, Printer, QrCode } from 'lucide-react';
import {
  useGetRestaurantQuery, useLazyGetVisitPromptPayQuery, usePayVisitMutation, type PaymentMethod, type TableVisit,
} from '../../api/apiSlice';
import { apiErrorMessage } from '../../lib/localized';
import { formatCurrency } from '../../lib/format';
import { formatClock } from '../orders/orderDisplay';
import { Alert, Button, Dialog, Field, Input, SegmentedControl, useToast } from '../../components/ui';

interface BillLine {
  key: string;
  name: string;
  options: string;
  quantity: number;
  amount: number;
}

/** One line per dish and options over all rounds ("2× Pad Thai (Hot)"), cancelled rounds left out. */
export function billLines(visit: TableVisit): BillLine[] {
  const map = new Map<string, BillLine>();
  for (const o of visit.orders) {
    if (o.status === 'CANCELLED') continue;
    for (const i of o.items) {
      const options = i.options.map((x) => x.name).join(', ');
      const key = `${i.name}|${options}|${i.unitPrice}`;
      const line = map.get(key) ?? { key, name: i.name, options, quantity: 0, amount: 0 };
      line.quantity += i.quantity;
      line.amount += i.unitPrice * i.quantity;
      map.set(key, line);
    }
  }
  return [...map.values()];
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export default function BillDialog({ visit, open, onClose, onPaid }: {
  visit: TableVisit;
  open: boolean;
  onClose: () => void;
  onPaid: () => void;
}) {
  const t = useTranslations('bill');
  const tc = useTranslations('common');
  const locale = useLocale();
  const toast = useToast();
  const { data: restaurant } = useGetRestaurantQuery();
  const [loadQr, { data: qr, isFetching: qrLoading, error: qrError }] = useLazyGetVisitPromptPayQuery();
  const [pay, { isLoading: paying }] = usePayVisitMutation();
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [received, setReceived] = useState('');
  const [ref, setRef] = useState('');
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [askServe, setAskServe] = useState<string | null>(null);

  const lines = useMemo(() => billLines(visit), [visit]);
  const total = visit.totals.total;
  const cash = Number(received.replace(',', '.'));
  const change = received && Number.isFinite(cash) ? Math.round((cash - total) * 100) / 100 : null;

  useEffect(() => {
    if (open && method === 'PROMPTPAY') void loadQr(visit.id);
  }, [open, method, visit.id, visit.totals.total, loadQr]);
  useEffect(() => {
    if (!qr) { setQrImage(null); return; }
    QRCode.toDataURL(qr.payload, { margin: 1, width: 300, errorCorrectionLevel: 'M' }).then(setQrImage).catch(() => setQrImage(null));
  }, [qr]);

  const submit = async (markServed = false) => {
    try {
      const res = await pay({ id: visit.id, method, providerRef: method === 'PROMPTPAY' ? ref || undefined : undefined, markServed }).unwrap();
      toast({ tone: 'success', title: t('paidToast', { table: visit.tableLabel, total: formatCurrency(res.total) }), description: t('paidHint') });
      setAskServe(null);
      onPaid();
    } catch (err) {
      const data = (err as { data?: { code?: string; message?: string } })?.data;
      if (data?.code === 'NOT_SERVED' && !markServed) {
        setAskServe(apiErrorMessage(err, locale, t('notServed')));
        return;
      }
      toast({ tone: 'error', title: t('payFailed'), description: apiErrorMessage(err, locale, tc('tryAgain')) });
    }
  };

  /** A simple slip in a new window: works with any receipt or office printer. */
  const printBill = () => {
    const w = window.open('', '_blank', 'width=420,height=700');
    if (!w) {
      toast({ tone: 'error', title: t('printBlocked') });
      return;
    }
    const rows = lines.map((l) => `<tr><td>${l.quantity}× ${escapeHtml(l.name)}${l.options ? `<div class="o">${escapeHtml(l.options)}</div>` : ''}</td><td class="r">${formatCurrency(l.amount)}</td></tr>`).join('');
    const qrBlock = method === 'PROMPTPAY' && qrImage
      ? `<div class="qr"><img src="${qrImage}" alt=""/><div>PromptPay${qr?.promptPayName ? ` · ${escapeHtml(qr.promptPayName)}` : ''}</div><div><b>${formatCurrency(qr?.amount ?? total)}</b></div></div>` : '';
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(t('slipTitle', { table: visit.tableLabel }))}</title>
<style>body{font-family:system-ui,'IBM Plex Sans Thai',sans-serif;margin:16px;font-size:14px;color:#000}h1{font-size:18px;margin:0 0 2px;text-align:center}
.m{text-align:center;color:#444;margin-bottom:12px}table{width:100%;border-collapse:collapse}td{padding:3px 0;vertical-align:top}.r{text-align:right;white-space:nowrap}
.o{font-size:12px;color:#555}.t td{border-top:1px solid #000;padding-top:6px}.big td{font-size:17px;font-weight:700}.qr{text-align:center;margin-top:14px}.qr img{width:200px;height:200px}
.f{text-align:center;margin-top:14px;color:#444}@media print{@page{margin:6mm}}</style></head><body>
<h1>${escapeHtml(restaurant?.name ?? '')}</h1><div class="m">${escapeHtml(t('slipTitle', { table: visit.tableLabel }))} · ${new Date().toLocaleString(locale === 'th' ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok' })}</div>
<table>${rows}<tr class="t"><td>${escapeHtml(t('subtotal'))}</td><td class="r">${formatCurrency(visit.totals.subtotal)}</td></tr>
<tr><td>${escapeHtml(t('vat'))}</td><td class="r">${formatCurrency(visit.totals.taxAmount)}</td></tr>
<tr class="big"><td>${escapeHtml(t('total'))}</td><td class="r">${formatCurrency(total)}</td></tr></table>${qrBlock}
<div class="f">${escapeHtml(t('thanks'))}</div><script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
  };

  return (
    <>
      <Dialog
        open={open && !askServe}
        onClose={onClose}
        size="lg"
        title={t('title', { table: visit.tableLabel })}
        description={t('description', { since: formatClock(visit.openedAt), rounds: visit.orders.filter((o) => o.status !== 'CANCELLED').length })}
        footer={
          <>
            <Button variant="secondary" icon={Printer} onClick={printBill}>{t('print')}</Button>
            <Button icon={CheckCircle2} loading={paying} onClick={() => submit()} disabled={total <= 0}>
              {t('markPaid', { total: formatCurrency(total) })}
            </Button>
          </>
        }
      >
        <div className="grid gap-6 md:grid-cols-2">
          <section aria-label={t('lines')}>
            <ul className="divide-y divide-line text-sm">
              {lines.map((l) => (
                <li key={l.key} className="flex justify-between gap-3 py-1.5">
                  <span>
                    <span className="tabular-nums text-fg-muted">{l.quantity}×</span> {l.name}
                    {l.options && <span className="block text-xs text-fg-muted">{l.options}</span>}
                  </span>
                  <span className="tabular-nums">{formatCurrency(l.amount)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
              <div className="flex justify-between text-fg-muted"><dt>{t('subtotal')}</dt><dd className="tabular-nums">{formatCurrency(visit.totals.subtotal)}</dd></div>
              <div className="flex justify-between text-fg-muted"><dt>{t('vat')}</dt><dd className="tabular-nums">{formatCurrency(visit.totals.taxAmount)}</dd></div>
              <div className="flex justify-between text-lg font-semibold text-fg"><dt>{t('total')}</dt><dd className="tabular-nums">{formatCurrency(total)}</dd></div>
            </dl>
          </section>

          <section className="flex flex-col gap-4" aria-label={t('payment')}>
            <SegmentedControl
              label={t('payment')}
              value={method}
              onChange={setMethod}
              options={[
                { value: 'CASH', label: t('cash'), icon: Banknote },
                { value: 'PROMPTPAY', label: 'PromptPay', icon: QrCode },
              ]}
            />
            {method === 'CASH' ? (
              <>
                <Field label={t('received')} htmlFor="bill-received">
                  <Input id="bill-received" inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} placeholder={String(total)} />
                </Field>
                {change !== null && (
                  change >= 0
                    ? <p className="text-lg font-semibold text-fg">{t('change', { amount: formatCurrency(change) })}</p>
                    : <Alert tone="warning">{t('tooLittle', { amount: formatCurrency(-change) })}</Alert>
                )}
              </>
            ) : (
              <>
                {qrError ? (
                  <Alert tone="warning">{apiErrorMessage(qrError, locale, t('qrFailed'))}</Alert>
                ) : (
                  <div className="flex flex-col items-center gap-1 rounded-card border border-line p-3">
                    {qrImage && !qrLoading
                      ? <img src={qrImage} alt={t('qrAlt', { total: formatCurrency(qr?.amount ?? total) })} className="h-48 w-48" />
                      : <div className="h-48 w-48 animate-pulse rounded bg-surface-muted" />}
                    <p className="text-sm text-fg-muted">{qr?.promptPayName}</p>
                    <p className="text-lg font-semibold tabular-nums text-fg">{formatCurrency(qr?.amount ?? total)}</p>
                    <p className="text-center text-xs text-fg-muted">{t('qrHint')}</p>
                  </div>
                )}
                <Field label={t('ref')} htmlFor="bill-ref" hint={t('refHint')}>
                  <Input id="bill-ref" value={ref} maxLength={100} onChange={(e) => setRef(e.target.value)} />
                </Field>
              </>
            )}
          </section>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(askServe)}
        onClose={() => setAskServe(null)}
        size="sm"
        title={t('notServedTitle')}
        description={askServe ?? ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAskServe(null)}>{tc('cancel')}</Button>
            <Button loading={paying} onClick={() => submit(true)}>{t('serveAndPay')}</Button>
          </>
        }
      />
    </>
  );
}
