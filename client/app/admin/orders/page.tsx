'use client';

import { Fragment, useMemo, useState } from 'react';
import {
  Bell, BellOff, Bike, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, ExternalLink, Store,
} from 'lucide-react';
import {
  useGetAdminOrdersQuery,
  useGetMeQuery,
  useMarkOrderPaidMutation,
  useRefundOrderMutation,
  useUpdateOrderStatusMutation,
  type CancelReason,
  type Order,
  type OrderStatus,
  type StatusChangeInput,
} from '../../../src/api/apiSlice';
import OrderStatusBadge from '../../../src/features/orders/OrderStatusBadge';
import PaymentBadge from '../../../src/features/orders/PaymentBadge';
import {
  CANCEL_REASON_LABELS,
  formatClock,
  formatOrderNumber,
  forwardActionLabel,
  isFinal,
  nextForwardStatus,
  shortStatusLabel,
} from '../../../src/features/orders/orderDisplay';
import { AcceptDialog, CancelDialog, CompleteCashDialog, MarkPaidDialog, RefundDialog } from '../../../src/features/admin/orders/OrderDialogs';
import { useNewOrderAlert } from '../../../src/features/admin/orders/useNewOrderAlert';
import { bangkokDateISO, formatCurrency } from '../../../src/lib/format';
import { useRequireRole } from '../../../src/routes/useAuthGuard';
import {
  Alert, Button, Card, ChipGroup, EmptyState, IconButton, LoadingBlock, PageContainer, PageHeader, Table, TBody, TD, TH, THead,
  cn, ICON_SM, ICON_STROKE, useToast,
} from '../../../src/components/ui';

type StatusFilter = '' | OrderStatus;
const STATUS_ORDER: OrderStatus[] = ['PENDING', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];

// After how many minutes a new (unaccepted) order is shown in amber, then red.
const WAIT_WARN_MIN = 5;
const WAIT_ALERT_MIN = 10;

// --- date helpers (Bangkok business day, YYYY-MM-DD) ---
const todayISO = () => bangkokDateISO();
const ddmmyyyy = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
const shiftDay = (iso: string, delta: number) => {
  const dt = new Date(`${iso}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
};

function errorMessage(err: unknown): string {
  const msg = (err as { data?: { message?: unknown } } | undefined)?.data?.message;
  return typeof msg === 'string' && msg ? msg : 'Could not update the order. Please try again.';
}

/** Google Maps link: exact pin when the customer shared a location, else the address text. */
function mapsUrl(order: Order): string | null {
  if (order.deliveryLat != null && order.deliveryLng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${order.deliveryLat},${order.deliveryLng}`;
  }
  if (order.deliveryAddress) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.deliveryAddress)}`;
  }
  return null;
}

function minutesSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

/** Same rule as the server: open payments, except a cancelled order nobody paid for. */
const canMarkPaid = (o: Order) =>
  (o.paymentStatus === 'UNPAID' || o.paymentStatus === 'PENDING') && !(o.status === 'CANCELLED' && o.paymentStatus === 'UNPAID');

/** Toast text after a forward step, e.g. "#014 accepted". */
const FORWARD_DONE: Record<string, string> = {
  PREPARING: 'accepted',
  READY: 'is ready',
  OUT_FOR_DELIVERY: 'is out for delivery',
  DELIVERED: 'completed',
};

/* ------------------------------------------------------------------ parts -- */

function DetailLabel({ children }: { children: React.ReactNode }) {
  return <dt className="text-xs font-medium uppercase tracking-wide text-fg-muted">{children}</dt>;
}

function OrderDetail({ order, isOwner, onRefund }: { order: Order; isOwner: boolean; onRefund: () => void }) {
  const phone = order.customerPhone || order.user?.phone;
  const map = order.type === 'DELIVERY' ? mapsUrl(order) : null;
  return (
    <div className="grid gap-6 border-t border-line bg-surface-muted/40 px-5 py-5 text-sm md:grid-cols-3">
      <section aria-label="Items">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-muted">Items</p>
        <ul className="space-y-1.5">
          {order.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 text-fg">
              <span>
                <span className="mr-1.5 inline-block min-w-[1.75rem] font-semibold tabular-nums">{i.quantity}×</span>
                {i.nameSnapshot}
              </span>
              <span className="tabular-nums text-fg-muted">{formatCurrency(i.unitPrice * i.quantity)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex justify-between border-t border-line pt-2 font-semibold text-fg">
          <span>Total{order.deliveryFee > 0 ? ' (incl. delivery)' : ''}</span>
          <span className="tabular-nums">{formatCurrency(order.total)}</span>
        </p>
      </section>

      <dl className="space-y-3">
        <div>
          <DetailLabel>Customer</DetailLabel>
          <dd className="mt-0.5 text-fg">{order.user?.name ?? '—'}</dd>
        </div>
        <div>
          <DetailLabel>Phone</DetailLabel>
          <dd className="mt-0.5">
            {phone ? (
              <a href={`tel:${phone.replace(/[\s-]/g, '')}`} className="font-medium text-accent underline-offset-2 hover:underline">
                {phone}
              </a>
            ) : (
              '—'
            )}
          </dd>
        </div>
        {order.type === 'DELIVERY' && (
          <div>
            <DetailLabel>Address</DetailLabel>
            <dd className="mt-0.5 text-fg">
              {order.deliveryAddress || '—'}
              {map && (
                <a
                  href={map}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 flex w-fit items-center gap-1 font-medium text-accent underline-offset-2 hover:underline"
                >
                  Open map
                  <ExternalLink size={14} strokeWidth={ICON_STROKE} aria-hidden />
                </a>
              )}
            </dd>
          </div>
        )}
        {order.estimatedReadyAt && !isFinal(order.status) && (
          <div>
            <DetailLabel>Promised ready</DetailLabel>
            <dd className="mt-0.5 tabular-nums text-fg">{formatClock(order.estimatedReadyAt)}</dd>
          </div>
        )}
        {order.status === 'CANCELLED' && order.cancelReason && (
          <div>
            <DetailLabel>Reason</DetailLabel>
            <dd className="mt-0.5 text-danger">
              {CANCEL_REASON_LABELS[order.cancelReason]}
              {order.cancelNote ? ` — ${order.cancelNote}` : ''}
            </dd>
          </div>
        )}
      </dl>

      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">Payment</p>
          <div className="flex flex-wrap items-center gap-2">
            <PaymentBadge order={order} />
            {isOwner && order.paymentStatus === 'PAID' && (
              <Button variant="ghost" size="sm" className="!text-danger" onClick={onRefund}>
                Record refund
              </Button>
            )}
          </div>
          {order.payments && order.payments.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-fg-muted">
              {order.payments.map((p, idx) => (
                <li key={idx}>
                  <span className="tabular-nums">{formatClock(p.createdAt)}</span> · {p.status === 'PAID' ? 'Paid' : 'Refunded'}{' '}
                  <span className="tabular-nums">{formatCurrency(p.amount)}</span>
                  {p.confirmedBy ? ` · ${p.confirmedBy.name}` : ''}
                  {p.providerRef ? ` · ref ${p.providerRef}` : ''}
                  {p.note ? ` · ${p.note}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
        {order.statusHistory && order.statusHistory.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">History</p>
            <ol className="relative space-y-2 border-l border-line pl-4 text-xs">
              {order.statusHistory.map((h, idx) => (
                <li key={idx} className="relative text-fg-muted">
                  <span className="absolute -left-[1.3rem] top-1 h-2 w-2 rounded-full border-2 border-surface bg-line-strong" aria-hidden />
                  <span className="tabular-nums text-fg">{formatClock(h.createdAt)}</span> · {shortStatusLabel(h.toStatus, order.type)}
                  {h.actor ? ` · ${h.actor.name}` : ''}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

/** Time hint under the status: how long a new order has waited, or when a cooking order is due. */
function TimingHint({ order }: { order: Order }) {
  if (order.status === 'PENDING') {
    const waiting = minutesSince(order.createdAt);
    if (waiting < WAIT_WARN_MIN) return null;
    return (
      <span className={cn('mt-1 block text-xs font-medium tabular-nums', waiting >= WAIT_ALERT_MIN ? 'text-danger' : 'text-warning')}>
        waiting {waiting} min
      </span>
    );
  }
  if (order.status === 'PREPARING' && order.estimatedReadyAt) {
    const due = new Date(order.estimatedReadyAt).getTime();
    if (due < Date.now()) {
      return <span className="mt-1 block text-xs font-medium text-danger">late · due {formatClock(order.estimatedReadyAt)}</span>;
    }
    return <span className="mt-1 block text-xs tabular-nums text-fg-muted">due {formatClock(order.estimatedReadyAt)}</span>;
  }
  return null;
}

function DayStepper({ day, setDay }: { day: string; setDay: (fn: (d: string) => string) => void }) {
  const today = todayISO();
  const label = day ? (day === today ? 'Today' : ddmmyyyy(day)) : 'All dates';
  return (
    <div className="flex items-center gap-1">
      <IconButton icon={ChevronLeft} label="Previous day" variant="secondary" onClick={() => setDay((d) => (d ? shiftDay(d, -1) : today))} />
      <div className="relative">
        <span className="inline-flex h-9 min-w-[8.5rem] cursor-pointer select-none items-center justify-center gap-2 rounded-control border border-line-strong/60 bg-surface px-3 text-sm font-medium text-fg">
          <CalendarDays size={ICON_SM} strokeWidth={ICON_STROKE} className="text-fg-muted" aria-hidden />
          {label}
        </span>
        <input
          type="date"
          value={day}
          max={today}
          onChange={(e) => setDay(() => e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="Pick a date"
        />
      </div>
      <IconButton
        icon={ChevronRight}
        label="Next day"
        variant="secondary"
        disabled={day === today}
        onClick={() => setDay((d) => (d ? shiftDay(d, 1) : today))}
      />
      {day !== today && (
        <Button variant="ghost" size="sm" onClick={() => setDay(() => today)}>
          Today
        </Button>
      )}
      {day && (
        <Button variant="ghost" size="sm" onClick={() => setDay(() => '')}>
          All dates
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- page -- */

export default function AdminOrdersPage() {
  const { ready } = useRequireRole('STAFF');
  const toast = useToast();
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('');
  const [day, setDayState] = useState(todayISO); // '' = all dates
  const setDay = (fn: (d: string) => string) => setDayState(fn);

  // For one day, load every order and filter here, so the chips can show counts
  // and the new-order chime hears new orders whichever chip is selected. For
  // "All dates" the server filters, to keep the list small.
  const serverStatus = day ? undefined : filterStatus || undefined;
  const { data: orders, isLoading, isFetching, fulfilledTimeStamp } = useGetAdminOrdersQuery(
    { status: serverStatus, date: day || undefined },
    { pollingInterval: 15000, skip: !ready },
  );
  const [updateStatus, { isLoading: savingStatus }] = useUpdateOrderStatusMutation();
  const [markPaid, { isLoading: savingPaid }] = useMarkOrderPaidMutation();
  const [refund, { isLoading: savingRefund }] = useRefundOrderMutation();
  const saving = savingStatus || savingPaid || savingRefund;
  const { data: me } = useGetMeQuery(undefined, { skip: !ready });
  const isOwner = me?.role === 'SUPER_ADMIN';
  const [expanded, setExpanded] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<Order | null>(null);
  const [cancelling, setCancelling] = useState<Order | null>(null);
  const [paying, setPaying] = useState<Order | null>(null);
  const [completing, setCompleting] = useState<Order | null>(null);
  const [refunding, setRefunding] = useState<Order | null>(null);
  const [actionError, setActionError] = useState('');
  const { soundOn, toggleSound, pendingCount } = useNewOrderAlert(orders);

  const all = useMemo(() => orders ?? [], [orders]);
  const list = useMemo(
    () => (day && filterStatus ? all.filter((o) => o.status === filterStatus) : all),
    [all, day, filterStatus],
  );

  const counts = useMemo(() => {
    const c: Partial<Record<OrderStatus, number>> = {};
    for (const o of all) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [all]);

  const attempt = async (action: () => Promise<unknown>, success?: string) => {
    setActionError('');
    try {
      await action();
      if (success) toast({ title: success });
      return true;
    } catch (err) {
      setActionError(errorMessage(err));
      return false;
    }
  };
  const run = (change: StatusChangeInput, success?: string) => attempt(() => updateStatus(change).unwrap(), success);

  const forward = (order: Order) => {
    const next = nextForwardStatus(order);
    if (!next) return;
    if (next === 'PREPARING') setAccepting(order); // accepting asks for a prep time
    // Completing an unpaid cash order asks whether the cash was collected.
    else if (next === 'DELIVERED' && order.paymentMethod === 'CASH' && order.paymentStatus === 'UNPAID') setCompleting(order);
    else void run({ id: order.id, status: next as StatusChangeInput['status'] }, `${formatOrderNumber(order)} ${FORWARD_DONE[next]}`);
  };

  if (!ready) return null;

  const dayText = day ? (day === todayISO() ? 'Today' : ddmmyyyy(day)) : 'All dates';
  const updated = fulfilledTimeStamp ? formatClock(new Date(fulfilledTimeStamp).toISOString()) : null;

  const chipOptions = [
    { value: '' as StatusFilter, label: 'All', count: day ? all.length : undefined },
    ...STATUS_ORDER.map((s) => ({
      value: s as StatusFilter,
      label: shortStatusLabel(s),
      count: day ? counts[s] ?? 0 : undefined,
      emphasis: s === 'PENDING',
    })),
  ];

  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Service"
        title={
          <span className="inline-flex items-center gap-3">
            Orders
            {pendingCount > 0 && (
              <span className="rounded-full bg-warning-soft px-2.5 py-0.5 text-sm font-medium tabular-nums text-warning">
                {pendingCount} new
              </span>
            )}
          </span>
        }
        description={
          <span className="tabular-nums">
            {dayText}
            {updated && ` · updated ${updated}`}
            {isFetching && !isLoading ? ' · refreshing…' : ''}
          </span>
        }
        actions={
          <>
            <Button
              variant="secondary"
              icon={soundOn ? Bell : BellOff}
              onClick={toggleSound}
              aria-pressed={soundOn}
              title="Chime when a new order arrives"
            >
              {soundOn ? 'Sound on' : 'Sound off'}
            </Button>
            <DayStepper day={day} setDay={setDay} />
          </>
        }
      />

      {/* Stays in view while scrolling a long list. */}
      <div className="sticky top-14 z-20 -mx-4 mb-4 border-b border-line/70 bg-canvas/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-canvas/85 sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-8 lg:px-8">
        <ChipGroup label="Filter by status" value={filterStatus} onChange={setFilterStatus} options={chipOptions} />
      </div>

      {actionError && (
        <Alert
          tone="danger"
          className="mb-4"
          action={<Button variant="ghost" size="sm" onClick={() => setActionError('')}>Dismiss</Button>}
        >
          {actionError}
        </Alert>
      )}

      <Card className="overflow-hidden">
        {isLoading ? (
          <LoadingBlock label="Loading orders…" />
        ) : list.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={
              filterStatus
                ? `No ${shortStatusLabel(filterStatus).toLowerCase()} orders`
                : `No orders${day ? (day === todayISO() ? ' today' : ` on ${ddmmyyyy(day)}`) : ''} yet`
            }
            description={day === todayISO() ? 'New orders appear here automatically.' : undefined}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH className="w-28">Order</TH>
                <TH className="hidden min-[1400px]:table-cell">Time</TH>
                <TH>Customer</TH>
                <TH className="hidden min-[1400px]:table-cell">Type</TH>
                <TH numeric>Total</TH>
                <TH>Status</TH>
                <TH numeric>Action</TH>
              </tr>
            </THead>
            <TBody>
              {list.map((order) => {
                const open = expanded === order.id;
                const isNew = order.status === 'PENDING';
                const transferToCheck = order.paymentStatus === 'PENDING';
                return (
                  <Fragment key={order.id}>
                    <tr
                      className={cn(
                        'cursor-pointer transition-colors duration-100 hover:bg-surface-hover',
                        isNew && 'bg-warning-soft/35 shadow-[inset_3px_0_0_rgb(var(--warning))]',
                        open && 'bg-surface-hover',
                      )}
                      onClick={() => setExpanded(open ? null : order.id)}
                      aria-expanded={open}
                    >
                      <TD className="whitespace-nowrap font-semibold tabular-nums">
                        <span className="inline-flex items-center gap-1.5">
                          <ChevronRight
                            size={ICON_SM}
                            strokeWidth={ICON_STROKE}
                            aria-hidden
                            className={cn('text-fg-subtle transition-transform duration-150', open && 'rotate-90')}
                          />
                          {formatOrderNumber(order)}
                        </span>
                        {/* Narrower screens: time sits under the number instead of its own column. */}
                        <span className="ml-[1.375rem] block text-xs font-normal text-fg-muted min-[1400px]:hidden">
                          {formatClock(order.createdAt)}
                        </span>
                      </TD>
                      <TD muted className="hidden whitespace-nowrap tabular-nums min-[1400px]:table-cell">
                        {formatClock(order.createdAt)}
                        {!day && <span className="block text-xs">{ddmmyyyy(bangkokDateISO(new Date(order.createdAt)))}</span>}
                      </TD>
                      <TD className="max-w-[12rem]">
                        <span className="flex items-center gap-2">
                          <span className="text-fg-subtle min-[1400px]:hidden" title={order.type === 'DELIVERY' ? 'Delivery' : 'Pickup'}>
                            {order.type === 'DELIVERY' ? (
                              <Bike size={ICON_SM} strokeWidth={ICON_STROKE} aria-label="Delivery" />
                            ) : (
                              <Store size={ICON_SM} strokeWidth={ICON_STROKE} aria-label="Pickup" />
                            )}
                          </span>
                          <span className="truncate">{order.user?.name ?? '—'}</span>
                        </span>
                      </TD>
                      <TD muted className="hidden whitespace-nowrap min-[1400px]:table-cell">
                        <span className="inline-flex items-center gap-1.5">
                          {order.type === 'DELIVERY' ? (
                            <Bike size={ICON_SM} strokeWidth={ICON_STROKE} aria-hidden />
                          ) : (
                            <Store size={ICON_SM} strokeWidth={ICON_STROKE} aria-hidden />
                          )}
                          {order.type === 'DELIVERY' ? 'Delivery' : 'Pickup'}
                        </span>
                      </TD>
                      <TD numeric className="py-2.5">
                        <span className="font-semibold">{formatCurrency(order.total)}</span>
                        <span className="mt-1 block">
                          <PaymentBadge order={order} />
                        </span>
                      </TD>
                      <TD className="py-2.5">
                        <OrderStatusBadge status={order.status} type={order.type} short />
                        <TimingHint order={order} />
                      </TD>
                      <TD className="whitespace-nowrap py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        {/* Next step on top when stacked (tablets), in one row on wide screens. */}
                        <div className="flex flex-col-reverse items-end gap-1.5 xl:flex-row xl:items-center xl:justify-end xl:gap-2">
                          {!isFinal(order.status) && (
                            <Button variant="ghost" size="sm" className="!text-danger hover:!bg-danger-soft" onClick={() => setCancelling(order)}>
                              {isNew ? 'Reject' : 'Cancel'}
                            </Button>
                          )}
                          {canMarkPaid(order) && (
                            <Button
                              variant="secondary"
                              disabled={saving}
                              onClick={() => setPaying(order)}
                              className={cn(transferToCheck && '!border-warning !text-warning')}
                            >
                              {transferToCheck ? 'Check transfer' : 'Mark paid'}
                            </Button>
                          )}
                          {nextForwardStatus(order) && (
                            <Button disabled={saving} onClick={() => forward(order)} className="min-w-[7.5rem]">
                              {forwardActionLabel(order)}
                            </Button>
                          )}
                        </div>
                      </TD>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={7} className="p-0">
                          <OrderDetail order={order} isOwner={isOwner} onRefund={() => setRefunding(order)} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      {accepting && (
        <AcceptDialog
          order={accepting}
          busy={saving}
          onClose={() => setAccepting(null)}
          onConfirm={async (prepMinutes) => {
            await run(
              { id: accepting.id, status: 'PREPARING', prepMinutes },
              `${formatOrderNumber(accepting)} accepted · ready in ${prepMinutes} min`,
            );
            setAccepting(null); // close either way so an error message is visible
          }}
        />
      )}
      {cancelling && (
        <CancelDialog
          order={cancelling}
          busy={saving}
          onClose={() => setCancelling(null)}
          onConfirm={async (cancelReason: CancelReason, cancelNote: string) => {
            await run(
              { id: cancelling.id, status: 'CANCELLED', cancelReason, cancelNote: cancelNote || undefined },
              `${formatOrderNumber(cancelling)} ${cancelling.status === 'PENDING' ? 'rejected' : 'cancelled'}`,
            );
            setCancelling(null);
          }}
        />
      )}
      {completing && (
        <CompleteCashDialog
          order={completing}
          busy={saving}
          onClose={() => setCompleting(null)}
          onConfirm={async (cashReceived) => {
            const ok = await run({ id: completing.id, status: 'DELIVERED' }, cashReceived ? undefined : `${formatOrderNumber(completing)} completed`);
            // Two calls: if the payment one fails, the order is still completed
            // and "Mark paid" stays on the row with the error shown above.
            if (ok && cashReceived) {
              await attempt(() => markPaid({ id: completing.id }).unwrap(), `${formatOrderNumber(completing)} completed · cash received`);
            }
            setCompleting(null);
          }}
        />
      )}
      {paying && (
        <MarkPaidDialog
          order={paying}
          busy={saving}
          onClose={() => setPaying(null)}
          onConfirm={async (providerRef) => {
            await attempt(
              () => markPaid({ id: paying.id, providerRef: providerRef || undefined }).unwrap(),
              `Payment recorded for ${formatOrderNumber(paying)}`,
            );
            setPaying(null);
          }}
        />
      )}
      {refunding && (
        <RefundDialog
          order={refunding}
          busy={saving}
          onClose={() => setRefunding(null)}
          onConfirm={async (note) => {
            await attempt(() => refund({ id: refunding.id, note }).unwrap(), `Refund recorded for ${formatOrderNumber(refunding)}`);
            setRefunding(null);
          }}
        />
      )}
    </PageContainer>
  );
}
