'use client';

import { useState } from 'react';
import type { CancelReason, Order } from '../../../api/apiSlice';
import { CANCEL_REASON_LABELS, formatOrderNumber } from '../../orders/orderDisplay';
import { formatCurrency } from '../../../lib/format';
import { Button, Dialog, Field, Input, Textarea, checkboxClasses, cn } from '../../../components/ui';

const PREP_PRESETS = [10, 15, 20, 30, 45, 60];

function Money({ value }: { value: number }) {
  return <span className="font-semibold tabular-nums text-fg">{formatCurrency(value)}</span>;
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
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={`Accept order ${formatOrderNumber(order)}`}
      description="How long until it is ready? The customer sees this time."
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onClose}>Back</Button>
          <Button size="lg" loading={busy} onClick={() => onConfirm(minutes)}>
            {`Accept · ready in ${minutes} min`}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        {PREP_PRESETS.map((m) => {
          const active = minutes === m;
          return (
            <button
              key={m}
              type="button"
              aria-pressed={active}
              data-autofocus={active || undefined}
              onClick={() => setMinutes(m)}
              className={cn(
                'h-11 rounded-control border text-sm font-medium tabular-nums transition-colors duration-150',
                active
                  ? 'border-accent bg-accent text-accent-fg'
                  : 'border-line bg-surface text-fg hover:border-line-strong hover:bg-surface-hover',
              )}
            >
              {m} min
            </button>
          );
        })}
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm text-fg-muted">
        Other
        <Input
          type="number"
          min={1}
          max={240}
          value={minutes}
          onChange={(e) => setMinutes(Math.max(1, Math.min(240, Number(e.target.value) || 1)))}
          className="!h-9 !w-20 tabular-nums"
        />
        minutes
      </label>
    </Dialog>
  );
}

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
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={`Payment for ${formatOrderNumber(order)}`}
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onClose}>Back</Button>
          <Button size="lg" loading={busy} onClick={() => onConfirm(ref.trim())} data-autofocus={!promptPay || undefined}>
            {promptPay ? 'Transfer received' : 'Cash received'}
          </Button>
        </>
      }
    >
      <p className="text-fg-muted">
        {promptPay
          ? <>Open the bank app and check that <Money value={order.total} /> has arrived.</>
          : <>Collect <Money value={order.total} /> in cash.</>}
      </p>
      {promptPay && (
        <Field label="Transfer reference" htmlFor="paid-ref" hint="Optional — the last digits are enough." className="mt-4">
          <Input
            id="paid-ref"
            data-autofocus
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            maxLength={100}
            aria-describedby="paid-ref-hint"
          />
        </Field>
      )}
    </Dialog>
  );
}

/**
 * Completing an unpaid cash order (picked up / delivered): record the cash in
 * the same step, so a busy counter does not forget it.
 */
export function CompleteCashDialog({ order, busy, onConfirm, onClose }: {
  order: Order;
  busy: boolean;
  onConfirm: (cashReceived: boolean) => void;
  onClose: () => void;
}) {
  const [received, setReceived] = useState(true);
  const done = order.type === 'DELIVERY' ? 'Delivered' : 'Picked up';
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={`${done} · ${formatOrderNumber(order)}`}
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onClose}>Back</Button>
          <Button size="lg" loading={busy} onClick={() => onConfirm(received)} data-autofocus>
            {received ? `${done} · cash received` : `${done} · not paid yet`}
          </Button>
        </>
      }
    >
      <label className="flex cursor-pointer items-start gap-3 rounded-card border border-line bg-surface-muted/50 p-3">
        <input
          type="checkbox"
          checked={received}
          onChange={(e) => setReceived(e.target.checked)}
          className={cn(checkboxClasses, 'mt-0.5 !h-5 !w-5')}
        />
        <span>
          Cash received: <Money value={order.total} />
          <span className="mt-0.5 block text-xs text-fg-muted">Untick if the customer has not paid yet.</span>
        </span>
      </label>
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
    <Dialog
      open
      onClose={onClose}
      title={`Refund ${formatOrderNumber(order)}`}
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onClose}>Back</Button>
          <Button variant="danger" size="lg" loading={busy} disabled={!note.trim()} onClick={() => onConfirm(note.trim())}>
            Mark refunded
          </Button>
        </>
      }
    >
      <p className="text-fg-muted">
        Record that <Money value={order.total} /> was given back. This does not send any money; do the transfer or
        cash refund first.
      </p>
      <Field label="Why, and how it was refunded" htmlFor="refund-note" required className="mt-4">
        <Textarea id="refund-note" data-autofocus value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} />
      </Field>
    </Dialog>
  );
}

const STAFF_REASONS: CancelReason[] = ['SOLD_OUT', 'TOO_BUSY', 'CLOSING_SOON', 'OUT_OF_AREA', 'CUSTOMER_REQUEST', 'OTHER'];

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
  const needsNote = reason === 'OTHER' && !note.trim();
  return (
    <Dialog
      open
      onClose={onClose}
      title={`${verb} order ${formatOrderNumber(order)}`}
      description="The customer sees the reason and your note."
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onClose} data-autofocus>Back</Button>
          <Button variant="danger" size="lg" loading={busy} disabled={needsNote} onClick={() => onConfirm(reason, note.trim())}>
            {`${verb} order`}
          </Button>
        </>
      }
    >
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-fg">Reason</legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {STAFF_REASONS.map((r) => (
            <label
              key={r}
              className={cn(
                'flex h-10 cursor-pointer items-center gap-2.5 rounded-control border px-3 text-sm transition-colors',
                reason === r ? 'border-accent bg-accent-soft/60 text-fg' : 'border-line text-fg hover:bg-surface-hover',
              )}
            >
              <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} className={checkboxClasses} />
              {CANCEL_REASON_LABELS[r]}
            </label>
          ))}
        </div>
      </fieldset>
      <Field
        label="Note for the customer"
        htmlFor="cancel-note"
        required={reason === 'OTHER'}
        hint={reason === 'OTHER' ? 'Required when the reason is "Other".' : 'Optional.'}
        className="mt-4"
      >
        <Textarea id="cancel-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} />
      </Field>
    </Dialog>
  );
}
