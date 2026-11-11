'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { CancelReason, Order } from '../../../api/apiSlice';
import { formatOrderNumber } from '../../orders/orderDisplay';
import { useOrderLabels } from '../../orders/useOrderLabels';
import { formatCurrency } from '../../../lib/format';
import { Button, Dialog, Field, Input, Textarea, checkboxClasses, cn } from '../../../components/ui';

const PREP_PRESETS = [10, 15, 20, 30, 45, 60];

/** The amount in bold, for t.rich(..., { b }). */
const bold = (chunks: React.ReactNode) => <span className="font-semibold tabular-nums text-fg">{chunks}</span>;

/** Accept = move to PREPARING with a preparation time (drives the customer's ETA). */
export function AcceptDialog({ order, busy, onConfirm, onClose, defaultMinutes = 15 }: {
  order: Order;
  busy: boolean;
  onConfirm: (prepMinutes: number) => void;
  onClose: () => void;
  /** Pre-selected prep time (more while the kitchen is in busy mode). */
  defaultMinutes?: number;
}) {
  const t = useTranslations('orderDialogs');
  const tc = useTranslations('common');
  const [minutes, setMinutes] = useState(Math.min(240, defaultMinutes));
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={t('acceptTitle', { number: formatOrderNumber(order) })}
      description={t('acceptDescription')}
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onClose}>{tc('back')}</Button>
          <Button size="lg" loading={busy} onClick={() => onConfirm(minutes)}>
            {t('acceptButton', { minutes })}
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
              {t('minutesShort', { minutes: m })}
            </button>
          );
        })}
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm text-fg-muted">
        {t('other')}
        <Input
          type="number"
          min={1}
          max={240}
          value={minutes}
          onChange={(e) => setMinutes(Math.max(1, Math.min(240, Number(e.target.value) || 1)))}
          className="!h-9 !w-20 tabular-nums"
        />
        {t('minutes')}
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
  const t = useTranslations('orderDialogs');
  const tc = useTranslations('common');
  const [ref, setRef] = useState('');
  const promptPay = order.paymentMethod === 'PROMPTPAY';
  const amount = formatCurrency(order.total);
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={t('paymentTitle', { number: formatOrderNumber(order) })}
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onClose}>{tc('back')}</Button>
          <Button size="lg" loading={busy} onClick={() => onConfirm(ref.trim())} data-autofocus={!promptPay || undefined}>
            {promptPay ? t('transferReceived') : t('cashReceived')}
          </Button>
        </>
      }
    >
      <p className="text-fg-muted">
        {promptPay ? t.rich('checkBank', { amount, b: bold }) : t.rich('collectCash', { amount, b: bold })}
      </p>
      {promptPay && (
        <Field label={t('transferRef')} htmlFor="paid-ref" hint={t('transferRefHint')} className="mt-4">
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
  const t = useTranslations('orderDialogs');
  const tc = useTranslations('common');
  const labels = useOrderLabels();
  const [received, setReceived] = useState(true);
  const done = labels.forwardAction({ status: 'READY', type: order.type }); // "Picked up" / "Out for delivery"
  const doneLabel = order.type === 'DELIVERY' ? labels.forwardAction({ status: 'OUT_FOR_DELIVERY', type: order.type }) : done;
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={`${doneLabel} · ${formatOrderNumber(order)}`}
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onClose}>{tc('back')}</Button>
          <Button size="lg" loading={busy} onClick={() => onConfirm(received)} data-autofocus>
            {received ? t('doneCashReceived', { done: doneLabel }) : t('doneNotPaid', { done: doneLabel })}
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
          {t.rich('cashReceivedAmount', { amount: formatCurrency(order.total), b: bold })}
          <span className="mt-0.5 block text-xs text-fg-muted">{t('untickIfUnpaid')}</span>
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
  const t = useTranslations('orderDialogs');
  const tc = useTranslations('common');
  const [note, setNote] = useState('');
  return (
    <Dialog
      open
      onClose={onClose}
      title={t('refundTitle', { number: formatOrderNumber(order) })}
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onClose}>{tc('back')}</Button>
          <Button variant="danger" size="lg" loading={busy} disabled={!note.trim()} onClick={() => onConfirm(note.trim())}>
            {t('markRefunded')}
          </Button>
        </>
      }
    >
      <p className="text-fg-muted">{t.rich('refundText', { amount: formatCurrency(order.total), b: bold })}</p>
      <Field label={t('refundNote')} htmlFor="refund-note" required className="mt-4">
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
  const t = useTranslations('orderDialogs');
  const tc = useTranslations('common');
  const labels = useOrderLabels();
  const [reason, setReason] = useState<CancelReason>('SOLD_OUT');
  const [note, setNote] = useState('');
  const reject = order.status === 'PENDING';
  const needsNote = reason === 'OTHER' && !note.trim();
  const action = reject ? t('rejectOrder') : t('cancelOrder');
  return (
    <Dialog
      open
      onClose={onClose}
      title={`${action} ${formatOrderNumber(order)}`}
      description={t('cancelDescription')}
      footer={
        <>
          <Button variant="ghost" size="lg" onClick={onClose} data-autofocus>{tc('back')}</Button>
          <Button variant="danger" size="lg" loading={busy} disabled={needsNote} onClick={() => onConfirm(reason, note.trim())}>
            {action}
          </Button>
        </>
      }
    >
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-fg">{t('reason')}</legend>
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
              {labels.cancelReason(r)}
            </label>
          ))}
        </div>
      </fieldset>
      <Field
        label={t('noteForCustomer')}
        htmlFor="cancel-note"
        required={reason === 'OTHER'}
        hint={reason === 'OTHER' ? t('noteRequired') : t('optional')}
        className="mt-4"
      >
        <Textarea id="cancel-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} />
      </Field>
    </Dialog>
  );
}
