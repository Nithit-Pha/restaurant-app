import { useState, FormEvent } from 'react';
import { useAddExpenseMutation, NewExpense } from './financeApi';

const CATEGORIES = [
  'RENT',
  'LABOR',
  'UTILITIES',
  'FOOD_SUPPLY',
  'MARKETING',
  'MISCELLANEOUS',
] as const;

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Errors {
  amount?: string;
  category?: string;
  date?: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function ExpenseModal({ open, onClose }: Props) {
  const [addExpense, { isLoading }] = useAddExpenseMutation();
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
      reset();
      onClose();
    } catch (err: any) {
      setServerError(
        err?.data?.error || 'Failed to save expense. Please try again.',
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Add Expense</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {serverError && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Amount */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Amount <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                $
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 pl-7 outline-none focus:ring-2 ${
                  errors.amount
                    ? 'border-red-400 focus:ring-red-200'
                    : 'border-gray-300 focus:ring-indigo-200'
                }`}
                placeholder="0.00"
              />
            </div>
            {errors.amount && (
              <p className="mt-1 text-xs text-red-600">{errors.amount}</p>
            )}
          </div>

          {/* Category */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Category <span className="text-red-500">*</span>
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.replace('_', ' ')}
                </option>
              ))}
            </select>
            {errors.category && (
              <p className="mt-1 text-xs text-red-600">{errors.category}</p>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Date
            </label>
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200"
            />
            {errors.date && (
              <p className="mt-1 text-xs text-red-600">{errors.date}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={500}
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="Optional note…"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isLoading ? 'Saving…' : 'Save Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
