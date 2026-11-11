'use client';

import { useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useAddExpenseMutation, NewExpense } from './financeApi';
import { bangkokDateISO, formatCurrency } from '../../../lib/format';
import { Alert, Button, Dialog, Field, Input, Select, Textarea, useToast } from '../../../components/ui';

export const EXPENSE_CATEGORIES = [
  'RENT',
  'LABOR',
  'UTILITIES',
  'FOOD_SUPPLY',
  'MARKETING',
  'MISCELLANEOUS',
] as const;
type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Readable name for a category stored in the database ("FOOD_SUPPLY" -> "Food supply"). */
export function useCategoryLabel() {
  const t = useTranslations('finance.category');
  return (c: string) =>
    (EXPENSE_CATEGORIES as readonly string[]).includes(c)
      ? t(c as ExpenseCategory)
      : c.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (x) => x.toUpperCase());
}

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Errors {
  amount?: string;
  category?: string;
  date?: string;
}

const todayISO = () => bangkokDateISO();

export default function ExpenseModal({ open, onClose }: Props) {
  const t = useTranslations('finance.expense');
  const tc = useTranslations('common');
  const categoryLabel = useCategoryLabel();
  const [addExpense, { isLoading }] = useAddExpenseMutation();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>('FOOD_SUPPLY');
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState('');

  if (!open) return null;

  const validate = (): Errors => {
    const e: Errors = {};
    const value = Number(amount);
    if (amount.trim() === '' || Number.isNaN(value)) {
      e.amount = t('amountRequired');
    } else if (value <= 0) {
      e.amount = t('amountPositive');
    } else if (value > 1_000_000) {
      e.amount = t('amountTooLarge');
    }
    if (!EXPENSE_CATEGORIES.includes(category as ExpenseCategory)) {
      e.category = t('categoryInvalid');
    }
    if (date && Number.isNaN(new Date(date).getTime())) {
      e.date = t('dateInvalid');
    }
    return e;
  };

  const reset = () => {
    setAmount('');
    setCategory('FOOD_SUPPLY');
    setDate(todayISO());
    setDescription('');
    setErrors({});
    setServerError('');
  };

  const handleSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    setServerError('');
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length > 0) return;

    const payload: NewExpense = {
      amount: Number(amount),
      category,
      date: date ? new Date(date).toISOString() : undefined,
      description: description.trim() || undefined,
    };

    try {
      await addExpense(payload).unwrap();
      toast({ title: t('saved'), description: `${categoryLabel(category)} · ${formatCurrency(Number(amount))}` });
      reset();
      onClose();
    } catch (err) {
      setServerError((err as { data?: { error?: string } })?.data?.error || t('saveFailed'));
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      dismissOnBackdrop={false}
      title={t('title')}
      description={t('description')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{tc('cancel')}</Button>
          <Button type="submit" form="expense-form" loading={isLoading}>{t('save')}</Button>
        </>
      }
    >
      <form id="expense-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        {serverError && <Alert tone="danger">{serverError}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('amount')} htmlFor="exp-amount" required error={errors.amount}>
            <Input
              id="exp-amount"
              data-autofocus
              type="number"
              step="0.01"
              min="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="tabular-nums"
              aria-invalid={errors.amount ? true : undefined}
              aria-describedby={errors.amount ? 'exp-amount-error' : undefined}
            />
          </Field>
          <Field label={t('date')} htmlFor="exp-date" error={errors.date}>
            <Input id="exp-date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label={t('category')} htmlFor="exp-category" required error={errors.category}>
          <Select id="exp-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{categoryLabel(c)}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('note')} htmlFor="exp-note">
          <Textarea
            id="exp-note"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder={t('notePlaceholder')}
          />
        </Field>
      </form>
    </Dialog>
  );
}
