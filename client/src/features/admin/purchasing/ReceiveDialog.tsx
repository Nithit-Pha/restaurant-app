'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { apiErrorMessage } from '@/lib/localized';
import { formatCurrency } from '@/lib/format';
import { Alert, Button, Dialog, Field, Input, checkboxClasses, cn, useToast } from '../../../components/ui';
import { formatAmount } from '../stock/stockApi';
import { useReceiveDeliveryMutation, type PurchaseOrder } from './purchasingApi';

const ordered = (i: { packs: number; packSize: string }) => Math.round(i.packs * Number(i.packSize) * 1000) / 1000;
const remaining = (i: { packs: number; packSize: string; received: string }) => Math.max(0, Math.round((ordered(i) - Number(i.received)) * 1000) / 1000);

interface Line { ticked: boolean; amount: string; price: string }

/**
 * Staff (and owner): what arrived. Every line still due starts ticked with
 * what is left; the owner can also enter what each line cost.
 */
export default function ReceiveDialog({ po, isOwner, onDone }: { po: PurchaseOrder; isOwner: boolean; onDone: () => void }) {
  const t = useTranslations('purchasing');
  const ts = useTranslations('stock');
  const tc = useTranslations('common');
  const locale = useLocale();
  const toast = useToast();
  const [receive, { isLoading }] = useReceiveDeliveryMutation();
  const unit = (u: string) => ts(`unit.${u}`);
  const [lines, setLines] = useState<Record<string, Line>>(() => Object.fromEntries(po.items.map((i) => {
    const left = remaining(i);
    return [i.id, { ticked: left > 0, amount: left > 0 ? String(left) : '', price: '' }];
  })));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const set = (id: string, change: Partial<Line>) => setLines((l) => ({ ...l, [id]: { ...l[id], ...change } }));

  const chosen = po.items.filter((i) => lines[i.id].ticked);
  const priceTotal = chosen.reduce((sum, i) => sum + (Number(lines[i.id].price) || 0), 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const body = chosen.map((i) => {
      const l = lines[i.id];
      return { itemId: i.id, amount: Number(l.amount), price: isOwner && l.price.trim() !== '' ? Number(l.price) : undefined };
    });
    if (!body.length || body.every((b) => !(b.amount > 0))) { setError(t('receive.nothing')); return; }
    if (body.some((b) => Number.isNaN(b.amount) || b.amount < 0 || (b.price !== undefined && (Number.isNaN(b.price) || b.price < 0)))) {
      setError(t('receive.invalid'));
      return;
    }
    try {
      const after = await receive({ id: po.id, lines: body, note: note.trim() || null }).unwrap();
      toast({
        title: t('receive.done', { number: po.label }),
        description: after.status === 'RECEIVED' ? t('receive.doneAll') : t('receive.donePart'),
      });
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err, locale, t('receive.failed')));
    }
  };

  return (
    <Dialog
      open
      size="lg"
      onClose={onDone}
      dismissOnBackdrop={false}
      title={t('receive.title', { number: po.label })}
      description={isOwner ? t('receive.descriptionOwner') : t('receive.descriptionStaff')}
      footer={
        <>
          <Button variant="ghost" onClick={onDone}>{tc('cancel')}</Button>
          <Button type="submit" form="receive-form" loading={isLoading} disabled={!chosen.length}>{t('receive.submit', { count: chosen.length })}</Button>
        </>
      }
    >
      <form id="receive-form" onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <ul className="divide-y divide-line rounded-control border border-line">
          {po.items.map((i) => {
            const l = lines[i.id];
            const left = remaining(i);
            return (
              <li key={i.id} className={cn('flex flex-wrap items-center gap-3 px-3 py-2.5', !l.ticked && 'text-fg-muted')}>
                <input
                  type="checkbox"
                  className={checkboxClasses}
                  checked={l.ticked}
                  onChange={(e) => set(i.id, { ticked: e.target.checked })}
                  aria-label={t('receive.tickFor', { name: i.ingredientName })}
                />
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm font-medium', l.ticked && 'text-fg')}>{i.ingredientName}</p>
                  <p className="text-xs text-fg-muted">
                    {t('receive.orderedLine', {
                      ordered: `${formatAmount(ordered(i), locale)} ${unit(i.unit)}`,
                      received: `${formatAmount(i.received, locale)} ${unit(i.unit)}`,
                    })}
                    {left === 0 && <> · {t('receive.complete')}</>}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number" min="0" step="0.001" inputMode="decimal"
                    value={l.amount}
                    disabled={!l.ticked}
                    onChange={(e) => set(i.id, { amount: e.target.value })}
                    aria-label={t('receive.amountFor', { name: i.ingredientName })}
                    className="h-9 w-24 text-right tabular-nums"
                  />
                  <span className="w-10 text-xs text-fg-muted">{unit(i.unit)}</span>
                </div>
                {isOwner && (
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number" min="0" step="0.01" inputMode="decimal"
                      value={l.price}
                      disabled={!l.ticked}
                      placeholder="฿"
                      onChange={(e) => set(i.id, { price: e.target.value })}
                      aria-label={t('receive.priceFor', { name: i.ingredientName })}
                      className="h-9 w-24 text-right tabular-nums"
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {isOwner && (
          <p className="text-right text-sm text-fg-muted">
            {t('receive.priceTotal')}: <span className="font-semibold tabular-nums text-fg">{formatCurrency(priceTotal)}</span>
            <span className="block text-xs">{t('receive.priceHint')}</span>
          </p>
        )}
        <Field label={t('receive.note')} htmlFor="receive-note">
          <Input id="receive-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={t('receive.notePlaceholder')} />
        </Field>
      </form>
    </Dialog>
  );
}
