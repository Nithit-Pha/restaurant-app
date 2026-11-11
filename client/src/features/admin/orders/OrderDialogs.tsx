'use client';

import { useState } from 'react';
import type { CancelReason, Order } from '../../../api/apiSlice';
import { CANCEL_REASON_LABELS, formatOrderNumber } from '../../orders/orderDisplay';
import { formatCurrency } from '../../../lib/format';

const PREP_PRESETS = [10, 15, 20, 30, 45, 60];

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-xl shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** Accept = move to PREPARING with a preparation time (drives the customer's ETA). */
export function AcceptDialog({ order, busy, onConfirm, onClose }: {
  order: Order;
  busy: boolean;
  onConfirm: (prepMinutes: number) => void;
  onClose: () => void;
}) {
  const [minutes, setMinutes] = useState(15);
  return (
    <Dialog title={`Accept order ${formatOrderNumber(order)}`} onClose={onClose}>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">How long until it is ready?</p>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {PREP_PRESETS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMinutes(m)}
            className={`min-h-[44px] rounded-lg border text-sm font-medium ${
              minutes === m
                ? 'bg-brand-500 border-brand-500 text-white'
                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {m} min
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-5">
        Other:
        <input
          type="number"
          min={1}
          max={240}
          value={minutes}
          onChange={(e) => setMinutes(Math.max(1, Math.min(240, Number(e.target.value) || 1)))}
          className="w-20 border rounded px-2 py-1 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
        />
        minutes
      </label>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} className="min-h-[44px] px-4 rounded-lg border dark:border-gray-600 text-sm dark:text-gray-300">
          Back
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onConfirm(minutes)}
          className="min-h-[44px] px-4 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          {busy ? 'Accepting…' : `Accept · ready in ${minutes} min`}
        </button>
      </div>
    </Dialog>
  );
}

const inputCls =
  'w-full border rounded px-2 py-1.5 text-sm mb-4 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white';

/** Money received: cash in hand, or the PromptPay transfer seen in the bank app. */
export function MarkPaidDialog({ order, busy, onConfirm, onClose }: {
  order: Order;
  busy: boolean;
  onConfirm: (providerRef: string) => void;
  onClose: () => void;
}) {
  const [ref, setRef] = useState('');
  const promptPay = order.paymentMethod === 'PROMPTPAY';
  return (
    <Dialog title={`Payment for ${formatOrderNumber(order)}`} onClose={onClose}>
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
        {promptPay
          ? <>Open the bank app and check that <span className="font-semibold">{formatCurrency(order.total)}</span> has arrived.</>
          : <>Collect <span className="font-semibold">{formatCurrency(order.total)}</span> in cash.</>}
      </p>
      {promptPay && (
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          maxLength={100}
          placeholder="Transfer reference (optional)"
          aria-label="Transfer reference"
          className={inputCls}
        />
      )}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} className="min-h-[44px] px-4 rounded-lg border dark:border-gray-600 text-sm dark:text-gray-300">
          Back
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onConfirm(ref.trim())}
          className="min-h-[44px] px-4 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50"
        >
          {busy ? 'Saving…' : promptPay ? 'Transfer received' : 'Cash received'}
        </button>
      </div>
    </Dialog>
  );
}

/** Owner only: the money was given back to the customer. */
export function RefundDialog({ order, busy, onConfirm, onClose }: {
  order: Order;
  busy: boolean;
  onConfirm: (note: string) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  return (
    <Dialog title={`Refund ${formatOrderNumber(order)}`} onClose={onClose}>
      <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
        Record that <span className="font-semibold">{formatCurrency(order.total)}</span> was given back. This does not send any money; do the transfer or cash refund first.
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={300}
        rows={2}
        placeholder="Why, and how it was refunded"
        className={inputCls}
      />
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} className="min-h-[44px] px-4 rounded-lg border dark:border-gray-600 text-sm dark:text-gray-300">
          Back
        </button>
        <button
          type="button"
          disabled={busy || !note.trim()}
          onClick={() => onConfirm(note.trim())}
          className="min-h-[44px] px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Mark refunded'}
        </button>
      </div>
    </Dialog>
  );
}

const STAFF_REASONS: CancelReason[] =['SOLD_OUT', 'TOO_BUSY', 'CLOSING_SOON', 'OUT_OF_AREA', 'CUSTOMER_REQUEST', 'OTHER'];

/** Reject (while new) or cancel (later): always with a reason the customer sees. */
export function CancelDialog({ order, busy, onConfirm, onClose }: {
  order: Order;
  busy: boolean;
  onConfirm: (reason: CancelReason, note: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<CancelReason>('SOLD_OUT');
  const [note, setNote] = useState('');
  const verb = order.status === 'PENDING' ? 'Reject' : 'Cancel';
  return (
    <Dialog title={`${verb} order ${formatOrderNumber(order)}`} onClose={onClose}>
      <fieldset className="space-y-2 mb-4">
        <legend className="text-sm text-gray-600 dark:text-gray-400 mb-2">Reason (shown to the customer)</legend>
        {STAFF_REASONS.map((r) => (
          <label key={r} className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200 cursor-pointer">
            <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} className="accent-brand-500" />
            {CANCEL_REASON_LABELS[r]}
          </label>
        ))}
      </fieldset>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={300}
        rows={2}
        placeholder={reason === 'OTHER' ? 'Please explain (required for "Other")' : 'Note for the customer (optional)'}
        className="w-full border rounded px-2 py-1.5 text-sm mb-4 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
      />
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onClose} className="min-h-[44px] px-4 rounded-lg border dark:border-gray-600 text-sm dark:text-gray-300">
          Back
        </button>
        <button
          type="button"
          disabled={busy || (reason === 'OTHER' && !note.trim())}
          onClick={() => onConfirm(reason, note.trim())}
          className="min-h-[44px] px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50"
        >
          {busy ? 'Saving…' : `${verb} order`}
        </button>
      </div>
    </Dialog>
  );
}
