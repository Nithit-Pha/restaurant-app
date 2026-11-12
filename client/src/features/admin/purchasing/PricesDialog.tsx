'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { apiErrorMessage } from '@/lib/localized';
import { formatCurrency } from '@/lib/format';
import { Alert, Button, Dialog, Input, useToast } from '../../../components/ui';
import { formatAmount } from '../stock/stockApi';
import { useSetDeliveryPricesMutation, type PurchaseDelivery } from './purchasingApi';

/** Owner: what each line of a delivery cost. Saving makes or updates its one Finance expense. */
export default function PricesDialog({ poId, delivery, title, onDone }: { poId: string; delivery: PurchaseDelivery; title: string; onDone: () => void }) {
  const t = useTranslations('purchasing');
  const ts = useTranslations('stock');
  const tc = useTranslations('common');
  const locale = useLocale();
  const toast = useToast();
  const [save, { isLoading }] = useSetDeliveryPricesMutation();
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(delivery.lines.map((l) => [l.id, l.price === null ? '' : String(Number(l.price))])));
  const [error, setError] = useState('');
  const total = Object.values(prices).reduce((sum, p) => sum + (Number(p) || 0), 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const lines = delivery.lines.map((l) => ({ lineId: l.id, price: prices[l.id].trim() === '' ? null : Number(prices[l.id]) }));
    if (lines.some((l) => l.price !== null && (Number.isNaN(l.price) || l.price < 0))) { setError(t('receive.invalid')); return; }
    try {
      await save({ id: poId, deliveryId: delivery.id, lines }).unwrap();
      toast({ title: t('prices.saved'), description: total > 0 ? t('prices.savedHint', { amount: formatCurrency(total) }) : undefined });
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err, locale, t('prices.failed')));
    }
  };

  return (
    <Dialog
      open
      onClose={onDone}
      dismissOnBackdrop={false}
      title={title}
      description={t('prices.description')}
      footer={
        <>
          <Button variant="ghost" onClick={onDone}>{tc('cancel')}</Button>
          <Button type="submit" form="prices-form" loading={isLoading}>{t('prices.save')}</Button>
        </>
      }
    >
      <form id="prices-form" onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <ul className="divide-y divide-line rounded-control border border-line">
          {delivery.lines.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">{l.purchaseOrderItem.ingredientName}</p>
                <p className="text-xs text-fg-muted">{formatAmount(l.amount, locale)} {ts(`unit.${l.purchaseOrderItem.unit}`)}</p>
              </div>
              <Input
                type="number" min="0" step="0.01" inputMode="decimal" placeholder="฿"
                data-autofocus={l === delivery.lines[0] ? true : undefined}
                value={prices[l.id]}
                onChange={(e) => setPrices((p) => ({ ...p, [l.id]: e.target.value }))}
                aria-label={t('receive.priceFor', { name: l.purchaseOrderItem.ingredientName })}
                className="h-9 w-28 text-right tabular-nums"
              />
            </li>
          ))}
        </ul>
        <p className="text-right text-sm text-fg-muted">
          {t('receive.priceTotal')}: <span className="font-semibold tabular-nums text-fg">{formatCurrency(total)}</span>
        </p>
      </form>
    </Dialog>
  );
}
