'use client';

import { useState, FormEvent } from 'react';
import { useAddExpenseMutation, NewExpense } from './financeApi';
import { bangkokDateISO, formatCurrency } from '../../../lib/format';
import { Alert, Button, Dialog, Field, Input, Select, Textarea, useToast } from '../../../components/ui';

const CATEGORIES = [
  'RENT',
  'LABOR',
  'UTILITIES',
  'FOOD_SUPPLY',
  'MARKETING',
  'MISCELLANEOUS',
] as const;

/** Readable names for the expense categories stored in the database. */
export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  RENT: 'Rent',
  LABOR: 'Labor',
  UTILITIES: 'Utilities',
  FOOD_SUPPLY: 'Food supply',
  MARKETING: 'Marketing',
  MISCELLANEOUS: 'Miscellaneous',
};

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
      e.amount = 'Amount is required and must be a number.';
    } else if (value <= 0) {
      e.amount = 'Amount must be a positive number.';
    } else if (value > 1_000_000) {
      e.amount = 'Amount looks too large — please double-check.';
    }
    if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
      e.category = 'Please choose a valid category.';
    }
    if (date && Number.isNaN(new Date(date).getTime())) {
      e.date = 'Invalid date.';
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
      toast({ title: 'Expense saved', description: `${EXPENSE_CATEGORY_LABELS[category]} · ${formatCurrency(Number(amount))}` });
      reset();
      onClose();
    } catch (err) {
      setServerError((err as { data?: { error?: string } })?.data?.error || 'Failed to save expense. Please try again.');
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      dismissOnBackdrop={false}
      title="Add expense"
      description="Rent, wages, ingredients and other costs. Used for the profit figures."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="expense-form" loading={isLoading}>Save expense</Button>
        </>
      }
    >
      <form id="expense-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        {serverError && <Alert tone="danger">{serverError}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount (฿)" htmlFor="exp-amount" required error={errors.amount}>
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
          <Field label="Date" htmlFor="exp-date" error={errors.date}>
            <Input id="exp-date" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Category" htmlFor="exp-category" required error={errors.category}>
          <Select id="exp-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Note" htmlFor="exp-note">
          <Textarea
            id="exp-note"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Optional, e.g. supplier or invoice number"
          />
        </Field>
      </form>
    </Dialog>
  );
}
