'use client';

import { Fragment, useMemo, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import {
  useGetAdminOrdersQuery,
  useGetMeQuery,
  useMarkOrderPaidMutation,
  useRefundOrderMutation,
  useUpdateOrderStatusMutation,
  type CancelReason,
  type Order,
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

const STATUSES = ['', 'PENDING', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'] as const;

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

function OrderDetail({ order, isOwner, onRefund }: { order: Order; isOwner: boolean; onRefund: () => void }) {
  const phone = order.customerPhone || order.user?.phone;
  const map = order.type === 'DELIVERY' ? mapsUrl(order) : null;
  return (
    <div className="grid gap-4 sm:grid-cols-2 px-4 py-4 bg-gray-50 dark:bg-gray-900/40 text-sm">
      <div>
        <p className="font-semibold text-gray-900 dark:text-white mb-2">Items</p>
        <ul className="space-y-1">
          {order.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 text-gray-800 dark:text-gray-200">
              <span>
                <span className="font-semibold">{i.quantity}×</span> {i.nameSnapshot}
              </span>
              <span className="text-gray-500 dark:text-gray-400">{formatCurrency(i.unitPrice * i.quantity)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 pt-2 border-t dark:border-gray-700 flex justify-between font-semibold text-gray-900 dark:text-white">
          <span>Total{order.deliveryFee > 0 ? ' (incl. delivery)' : ''}</span>
          <span>{formatCurrency(order.total)}</span>
        </p>
      </div>
      <div className="space-y-2 text-gray-700 dark:text-gray-300">
        <p>
          <span className="text-gray-500 dark:text-gray-400">Customer:</span> {order.user?.name ?? '—'}
        </p>
        <p>
          <span className="text-gray-500 dark:text-gray-400">Phone:</span>{' '}
          {phone ? <a href={`tel:${phone.replace(/[\s-]/g, '')}`} className="text-brand-600 hover:underline">{phone}</a> : '—'}
        </p>
        {order.type === 'DELIVERY' && (
          <p>
            <span className="text-gray-500 dark:text-gray-400">Address:</span> {order.deliveryAddress || '—'}
            {map && (
              <>
                {' '}
                <a href={map} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline whitespace-nowrap">
                  Open map ↗
                </a>
              </>
            )}
          </p>
        )}
        {order.estimatedReadyAt && !isFinal(order.status) && (
          <p>
            <span className="text-gray-500 dark:text-gray-400">Promised ready:</span> {formatClock(order.estimatedReadyAt)}
          </p>
        )}
        {order.status === 'CANCELLED' && order.cancelReason && (
          <p className="text-red-600 dark:text-red-400">
            Cancelled: {CANCEL_REASON_LABELS[order.cancelReason]}
            {order.cancelNote ? ` — ${order.cancelNote}` : ''}
          </p>
        )}
        <div>
          <p>
            <span className="text-gray-500 dark:text-gray-400">Payment:</span> <PaymentBadge order={order} />
            {isOwner && order.paymentStatus === 'PAID' && (
              <button type="button" onClick={onRefund} className="ml-2 text-xs text-red-600 dark:text-red-400 hover:underline">
                Record refund
              </button>
            )}
          </p>
          {order.payments && order.payments.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs">
              {order.payments.map((p, idx) => (
                <li key={idx}>
                  <span className="tabular-nums">{formatClock(p.createdAt)}</span> · {p.status === 'PAID' ? 'Paid' : 'Refunded'}{' '}
                  {formatCurrency(p.amount)}
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
            <p className="text-gray-500 dark:text-gray-400 mb-1">History</p>
            <ol className="space-y-0.5 text-xs">
              {order.statusHistory.map((h, idx) => (
                <li key={idx}>
                  <span className="tabular-nums">{formatClock(h.createdAt)}</span> · {shortStatusLabel(h.toStatus, order.type)}
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

export default function AdminOrdersPage() {
  const { ready } = useRequireRole('STAFF');
  const [filterStatus, setFilterStatus] = useState('');
  const [day, setDay] = useState(todayISO); // '' = all dates
  const { data: orders, isLoading, isFetching, fulfilledTimeStamp } = useGetAdminOrdersQuery(
    { status: filterStatus || undefined, date: day || undefined },
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

  const list = useMemo(() => orders ?? [], [orders]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of list) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [list]);

  const attempt = async (action: () => Promise<unknown>) => {
    setActionError('');
    try {
      await action();
      return true;
    } catch (err) {
      setActionError(errorMessage(err));
      return false;
    }
  };
  const run = (change: StatusChangeInput) => attempt(() => updateStatus(change).unwrap());

  const forward = (order: Order) => {
    const next = nextForwardStatus(order);
    if (!next) return;
    if (next === 'PREPARING') setAccepting(order); // accepting asks for a prep time
    // Completing an unpaid cash order asks whether the cash was collected.
    else if (next === 'DELIVERED' && order.paymentMethod === 'CASH' && order.paymentStatus === 'UNPAID') setCompleting(order);
    else void run({ id: order.id, status: next as StatusChangeInput['status'] });
  };

  if (!ready) return null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Orders</h1>
          {pendingCount > 0 && (
            <span className="rounded-full bg-yellow-400 text-yellow-950 text-xs font-bold px-2.5 py-1">
              {pendingCount} new
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={soundOn}
            className="inline-flex items-center gap-1.5 text-xs rounded border dark:border-gray-600 px-2.5 py-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Chime when a new order arrives"
          >
            {soundOn ? <Bell size={14} strokeWidth={1.75} aria-hidden /> : <BellOff size={14} strokeWidth={1.75} aria-hidden />}
            {soundOn ? 'Sound on' : 'Sound off'}
          </button>

          {/* Date stepper: ‹ DD/MM/YYYY ›  (filtered on the server) */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setDay((d) => (d ? shiftDay(d, -1) : todayISO()))}
              aria-label="Previous day"
              className="w-8 h-8 flex items-center justify-center rounded border dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              ‹
            </button>
            <div className="relative">
              <span className="inline-block min-w-[7rem] text-center border dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white cursor-pointer select-none">
                {day ? (day === todayISO() ? 'Today' : ddmmyyyy(day)) : 'All dates'}
              </span>
              <input
                type="date"
                value={day}
                max={todayISO()}
                onChange={(e) => setDay(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                aria-label="Pick a date"
              />
            </div>
            <button
              onClick={() => setDay((d) => (d ? shiftDay(d, 1) : todayISO()))}
              disabled={day === todayISO()}
              aria-label="Next day"
              className="w-8 h-8 flex items-center justify-center rounded border dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
            >
              ›
            </button>
            {day !== todayISO() && (
              <button onClick={() => setDay(todayISO())} className="ml-1 text-xs text-brand-600 hover:underline">
                Today
              </button>
            )}
            {day && (
              <button onClick={() => setDay('')} className="ml-1 text-xs text-brand-600 hover:underline">
                All dates
              </button>
            )}
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            aria-label="Filter by status"
            className="border dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s ? shortStatusLabel(s) : 'All statuses'}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Status counts for the selected day */}
      {!filterStatus && list.length > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          {(['PENDING', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'] as const)
            .filter((s) => counts[s])
            .map((s) => `${shortStatusLabel(s)}: ${counts[s]}`)
            .join(' · ')}
          {fulfilledTimeStamp && (
            <span className="ml-2">· updated {formatClock(new Date(fulfilledTimeStamp).toISOString())}{isFetching ? ' …' : ''}</span>
          )}
        </p>
      )}

      {actionError && (
        <div role="alert" className="mb-3 rounded border border-red-300 bg-red-50 dark:bg-red-900/30 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300 flex justify-between gap-3">
          <span>{actionError}</span>
          <button onClick={() => setActionError('')} aria-label="Dismiss" className="font-bold">×</button>
        </div>
      )}

      {isLoading ? (
        <div className="text-center text-gray-400 py-12">Loading…</div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">Order</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">Time</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">Customer</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">Type</th>
                <th className="px-4 py-3 text-right font-medium text-gray-700 dark:text-gray-300">Total</th>
                <th className="px-4 py-3 text-center font-medium text-gray-700 dark:text-gray-300">Status</th>
                <th className="px-4 py-3 text-right font-medium text-gray-700 dark:text-gray-300">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {list.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                    No orders{day ? (day === todayISO() ? ' today' : ` on ${ddmmyyyy(day)}`) : ''} yet.
                  </td>
                </tr>
              ) : (
                list.map((order) => {
                  const open = expanded === order.id;
                  const waiting = order.status === 'PENDING' ? minutesSince(order.createdAt) : null;
                  const late =
                    order.status === 'PREPARING' && order.estimatedReadyAt && new Date(order.estimatedReadyAt).getTime() < Date.now();
                  return (
                    <Fragment key={order.id}>
                      <tr
                        className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 ${order.status === 'PENDING' ? 'bg-yellow-50/60 dark:bg-yellow-900/10' : ''}`}
                        onClick={() => setExpanded(open ? null : order.id)}
                        aria-expanded={open}
                      >
                        <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                          <span className="text-gray-400 mr-1">{open ? '▾' : '▸'}</span>
                          {formatOrderNumber(order)}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap tabular-nums">
                          {formatClock(order.createdAt)}
                          {!day && <span className="block text-xs">{ddmmyyyy(bangkokDateISO(new Date(order.createdAt)))}</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{order.user?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{order.type === 'DELIVERY' ? 'Delivery' : 'Pickup'}</td>
                        <td className="px-4 py-3 text-right font-semibold dark:text-white whitespace-nowrap">
                          {formatCurrency(order.total)}
                          <span className="block mt-0.5 font-normal"><PaymentBadge order={order} /></span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <OrderStatusBadge status={order.status} type={order.type} short />
                          {waiting != null && waiting >= 5 && (
                            <span className="block text-xs text-amber-600 mt-0.5">waiting {waiting} min</span>
                          )}
                          {late && <span className="block text-xs text-red-600 mt-0.5">late</span>}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {nextForwardStatus(order) && (
                            <button
                              onClick={() => forward(order)}
                              disabled={saving}
                              className="min-h-[36px] px-3 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold disabled:opacity-50"
                            >
                              {forwardActionLabel(order)}
                            </button>
                          )}
                          {canMarkPaid(order) && (
                            <button
                              onClick={() => setPaying(order)}
                              disabled={saving}
                              className={`ml-2 min-h-[36px] px-3 rounded-lg text-xs font-semibold disabled:opacity-50 ${
                                order.paymentStatus === 'PENDING'
                                  ? 'bg-amber-500 hover:bg-amber-600 text-white'
                                  : 'border border-green-600 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30'
                              }`}
                            >
                              {order.paymentStatus === 'PENDING' ? 'Check transfer' : 'Mark paid'}
                            </button>
                          )}
                          {!isFinal(order.status) && (
                            <button
                              onClick={() => setCancelling(order)}
                              className="ml-2 text-xs text-red-600 dark:text-red-400 hover:underline"
                            >
                              {order.status === 'PENDING' ? 'Reject' : 'Cancel'}
                            </button>
                          )}
                        </td>
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
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {accepting && (
        <AcceptDialog
          order={accepting}
          busy={saving}
          onClose={() => setAccepting(null)}
          onConfirm={async (prepMinutes) => {
            await run({ id: accepting.id, status: 'PREPARING', prepMinutes });
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
            await run({ id: cancelling.id, status: 'CANCELLED', cancelReason, cancelNote: cancelNote || undefined });
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
            const ok = await run({ id: completing.id, status: 'DELIVERED' });
            // Two calls: if the payment one fails, the order is still completed
            // and "Mark paid" stays on the row with the error shown above.
            if (ok && cashReceived) await attempt(() => markPaid({ id: completing.id }).unwrap());
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
            await attempt(() => markPaid({ id: paying.id, providerRef: providerRef || undefined }).unwrap());
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
            await attempt(() => refund({ id: refunding.id, note }).unwrap());
            setRefunding(null);
          }}
        />
      )}
    </div>
  );
}
