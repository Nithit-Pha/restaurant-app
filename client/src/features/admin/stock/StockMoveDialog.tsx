'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { apiErrorMessage } from '@/lib/localized';
import { formatCurrency } from '../../../lib/format';
import { Alert, Button, Dialog, Field, Input, Textarea, useToast } from '../../../components/ui';
import { formatAmount, useCountStockMutation, useStockInMutation, useWasteStockMutation, type Ingredient } from './stockApi';

export type MoveKind = 'in' | 'count' | 'waste';

const status = (err: unknown) => (err as { status?: number } | undefined)?.status;
const MAX = 100_000;

/**
 * Stock in (with an optional price for the owner), count the real stock, or
 * throw something away. One small form per kind.
 */
export default function StockMoveDialog({ kind, ingredient, isOwner, onDone }: {
  kind: MoveKind;
  ingredient: Ingredient;
  isOwner: boolean;
  onDone: () => void;
}) {
  const t = useTranslations('stock');
  const tc = useTranslations('common');
  const locale = useLocale();
  const toast = useToast();
  const [stockIn, { isLoading: l1 }] = useStockInMutation();
  const [countStock, { isLoading: l2 }] = useCountStockMutation();
  const [wasteStock, { isLoading: l3 }] = useWasteStockMutation();
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const unit = t(`unit.${ingredient.unit}`);
  const current = `${formatAmount(ingredient.quantity, locale)} ${unit}`;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const value = Number(amount);
    const zeroAllowed = kind === 'count';
    if (amount.trim() === '' || Number.isNaN(value) || value < 0 || (!zeroAllowed && value === 0) || value > MAX) {
      setError(t('amountInvalid'));
      return;
    }
    const priceValue = price.trim() === '' ? undefined : Number(price);
    if (priceValue !== undefined && (Number.isNaN(priceValue) || priceValue <= 0)) {
      setError(t('priceInvalid'));
      return;
    }
    if (kind === 'waste' && !text.trim()) {
      setError(t('reasonRequired'));
      return;
    }
    const note = text.trim() || undefined;
    try {
      if (kind === 'in') {
        await stockIn({ id: ingredient.id, amount: value, price: priceValue, note }).unwrap();
        toast({
          title: t('toast.in', { amount: formatAmount(value, locale), unit, name: ingredient.name }),
          description: priceValue ? t('toast.inExpense', { price: formatCurrency(priceValue) }) : undefined,
        });
      } else if (kind === 'count') {
        await countStock({ id: ingredient.id, counted: value, note }).unwrap();
        const diff = value - Number(ingredient.quantity);
        toast({
          title: t('toast.counted', { name: ingredient.name }),
          description: diff === 0 ? t('toast.countMatched') : t('toast.countDiff', { diff: `${diff > 0 ? '+' : ''}${formatAmount(diff, locale)}`, unit }),
        });
      } else {
        await wasteStock({ id: ingredient.id, amount: value, reason: text.trim() }).unwrap();
        toast({ title: t('toast.waste', { amount: formatAmount(value, locale), unit, name: ingredient.name }) });
      }
      onDone();
    } catch (err) {
      if (kind === 'count' && status(err) === 409) setError(t('countAgain'));
      else setError(apiErrorMessage(err, locale, t('saveFailed')));
    }
  };

  const titles = { in: t('inTitle', { name: ingredient.name }), count: t('countTitle', { name: ingredient.name }), waste: t('wasteTitle', { name: ingredient.name }) };
  const amountLabel = { in: t('field.amountIn'), count: t('field.counted'), waste: t('field.amountWaste') }[kind];

  return (
    <Dialog
      open
      onClose={onDone}
      dismissOnBackdrop={false}
      size="sm"
      title={titles[kind]}
      description={t('currentStock', { amount: current })}
      footer={
        <>
          <Button variant="ghost" onClick={onDone}>{tc('cancel')}</Button>
          <Button type="submit" form="stock-move-form" variant={kind === 'waste' ? 'danger' : 'primary'} loading={l1 || l2 || l3}>
            {{ in: t('action.in'), count: t('action.saveCount'), waste: t('action.waste') }[kind]}
          </Button>
        </>
      }
    >
      <form id="stock-move-form" onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label={`${amountLabel} (${unit})`} htmlFor="move-amount" required hint={kind === 'count' ? t('field.countedHint') : undefined}>
          <Input
            id="move-amount"
            data-autofocus
            type="number"
            min="0"
            step="0.001"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="tabular-nums"
          />
        </Field>
        {kind === 'in' && isOwner && (
          <Field label={t('field.price')} htmlFor="move-price" hint={t('field.priceHint')}>
            <Input id="move-price" type="number" min="0" step="0.01" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" className="tabular-nums" />
          </Field>
        )}
        <Field label={kind === 'waste' ? t('field.reason') : t('field.note')} htmlFor="move-text" required={kind === 'waste'}>
          <Textarea
            id="move-text"
            rows={2}
            maxLength={200}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={kind === 'waste' ? t('field.reasonPlaceholder') : t('field.notePlaceholder')}
          />
        </Field>
      </form>
    </Dialog>
  );
}
