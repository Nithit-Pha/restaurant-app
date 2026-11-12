'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRightLeft, BellRing, Check, Combine, Receipt, Sparkles, UserPlus } from 'lucide-react';
import {
  useConfirmVisitMutation, useGetStaffVisitQuery, useMarkTableCleanedMutation, useMergeVisitsMutation, useMoveVisitMutation,
  useSeatGuestsMutation, type DiningTable, type VisitBrief,
} from '../../api/apiSlice';
import { apiErrorMessage } from '../../lib/localized';
import { formatCurrency } from '../../lib/format';
import LineDetails from '../orders/LineDetails';
import OrderStatusBadge from '../orders/OrderStatusBadge';
import { formatClock } from '../orders/orderDisplay';
import { Alert, Button, Card, CardBody, Field, Input, LoadingBlock, Select, useToast } from '../../components/ui';
import { STATUS_FILL, minutesSince } from './tableStatus';
import BillDialog from './BillDialog';

interface Props {
  table: DiningTable;
  zoneName: string;
  visit?: VisitBrief;
  /** Every table with its zone and open visit, for "move" and "merge". */
  allTables: { table: DiningTable; zoneName: string; visit?: VisitBrief }[];
  locale: string;
}

/** What staff see and can do for one table on the floor view. */
export default function TablePanel({ table, zoneName, visit, allTables, locale }: Props) {
  const t = useTranslations('floorView');
  const tc = useTranslations('common');
  const toast = useToast();
  const [guests, setGuests] = useState('2');
  const [moveTo, setMoveTo] = useState('');
  const [mergeInto, setMergeInto] = useState('');
  const { data: detail, isFetching } = useGetStaffVisitQuery(visit?.id ?? '', { skip: !visit });
  const [seat, { isLoading: seating }] = useSeatGuestsMutation();
  const [confirm, { isLoading: confirming }] = useConfirmVisitMutation();
  const [move, { isLoading: moving }] = useMoveVisitMutation();
  const [merge, { isLoading: merging }] = useMergeVisitsMutation();
  const [cleaned, { isLoading: cleaning }] = useMarkTableCleanedMutation();
  const [billOpen, setBillOpen] = useState(false);

  const run = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      toast({ tone: 'success', title: done });
    } catch (err) {
      toast({ tone: 'error', title: apiErrorMessage(err, locale, tc('tryAgain')) });
    }
  };
  const guestCount = () => Math.max(1, Math.min(99, Math.round(Number(guests)) || 1));

  const freeTables = allTables.filter((x) => !x.visit && x.table.id !== table.id);
  const busyTables = allTables.filter((x) => x.visit && x.table.id !== table.id);

  return (
    <Card className="w-full shrink-0 self-start xl:w-96">
      <CardBody className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">{zoneName}</p>
            <h2 className="text-lg font-semibold text-fg">{t('tableTitle', { label: table.label })}</h2>
            <p className="text-sm text-fg-muted">{t('seats', { count: table.seats })}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-fg">
            <span className="h-2.5 w-2.5 rounded-full border border-line-strong" style={{ background: STATUS_FILL[table.status] }} aria-hidden />
            {t(`status.${table.status}`)}
          </span>
        </div>

        {!visit ? (
          <>
            {table.status === 'CLEANING' && (
              <Button variant="secondary" icon={Sparkles} loading={cleaning}
                onClick={() => run(() => cleaned(table.id).unwrap(), t('cleanedDone', { label: table.label }))}>
                {t('markCleaned')}
              </Button>
            )}
            <div className="flex items-end gap-2">
              <Field label={t('guests')} htmlFor="seat-guests" className="w-24">
                <Input id="seat-guests" type="number" inputMode="numeric" min={1} max={99} value={guests} onChange={(e) => setGuests(e.target.value)} />
              </Field>
              <Button icon={UserPlus} loading={seating}
                onClick={() => run(() => seat({ tableId: table.id, guests: guestCount() }).unwrap(), t('seated', { label: table.label }))}>
                {t('seatGuests')}
              </Button>
            </div>
            <p className="text-xs text-fg-muted">{t('seatHint')}</p>
          </>
        ) : (
          <>
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <div><dt className="text-xs text-fg-muted">{t('guests')}</dt><dd className="font-medium text-fg">{visit.guests ?? '—'}</dd></div>
              <div><dt className="text-xs text-fg-muted">{t('since')}</dt><dd className="font-medium text-fg">{formatClock(visit.openedAt)} · {t('minutes', { count: minutesSince(visit.openedAt) })}</dd></div>
              <div><dt className="text-xs text-fg-muted">{t('total')}</dt><dd className="font-semibold tabular-nums text-fg">{formatCurrency(visit.total)}</dd></div>
            </dl>

            {!visit.confirmed && (
              <Alert tone="warning" title={t('unconfirmedTitle')}
                action={
                  <Button size="sm" icon={Check} loading={confirming}
                    onClick={() => run(() => confirm({ id: visit.id, guests: visit.guests ?? guestCount() }).unwrap(), t('confirmed', { label: table.label }))}>
                    {t('confirm')}
                  </Button>
                }>
                {t('unconfirmedText')}
              </Alert>
            )}
            {visit.staffCalledAt && (
              <Alert tone="danger" title={t('calledTitle', { time: formatClock(visit.staffCalledAt) })}
                action={
                  <Button size="sm" variant="secondary" icon={BellRing} loading={confirming}
                    onClick={() => run(() => confirm({ id: visit.id }).unwrap(), t('calledDone'))}>
                    {t('done')}
                  </Button>
                }>
                {t('calledText')}
              </Alert>
            )}
            {visit.billRequestedAt && <Alert tone="info" title={t('billTitle', { time: formatClock(visit.billRequestedAt) })}>{t('billText')}</Alert>}

            {detail && detail.orders.some((o) => o.status !== 'CANCELLED') && (
              <Button icon={Receipt} variant={visit.billRequestedAt ? 'primary' : 'secondary'} onClick={() => setBillOpen(true)}>
                {t('billButton', { total: formatCurrency(detail.totals.total) })}
              </Button>
            )}
            {detail && <BillDialog visit={detail} open={billOpen} onClose={() => setBillOpen(false)} onPaid={() => setBillOpen(false)} />}

            <section>
              <h3 className="mb-2 text-sm font-semibold text-fg">{t('rounds')}</h3>
              {!detail ? (
                isFetching ? <LoadingBlock label={tc('loadingDots')} /> : null
              ) : detail.orders.length === 0 ? (
                <p className="text-sm text-fg-muted">{t('noOrders')}</p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {detail.orders.map((o, i) => (
                    <li key={o.id} className="rounded-control border border-line p-2.5">
                      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                        <span className="font-medium text-fg">{t('round', { n: i + 1 })} <span className="font-normal text-fg-muted">· {formatClock(o.createdAt)}</span></span>
                        <OrderStatusBadge status={o.status} type="DINE_IN" short />
                      </div>
                      <ul className="space-y-0.5 text-sm">
                        {o.items.map((l) => (
                          <li key={l.id}>
                            <span className="tabular-nums text-fg-muted">{l.quantity}×</span> {l.name}
                            <LineDetails options={l.options} note={l.note} className="ml-5 text-xs" />
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="flex flex-col gap-3 border-t border-line pt-3">
              <div className="flex items-end gap-2">
                <Field label={t('moveTo')} htmlFor="move-to" className="flex-1">
                  <Select id="move-to" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                    <option value="">{t('pickTable')}</option>
                    {freeTables.map((x) => <option key={x.table.id} value={x.table.id}>{x.table.label} · {x.zoneName}</option>)}
                  </Select>
                </Field>
                <Button variant="secondary" icon={ArrowRightLeft} disabled={!moveTo} loading={moving}
                  onClick={() => run(async () => { await move({ id: visit.id, tableId: moveTo }).unwrap(); setMoveTo(''); }, t('moved'))}>
                  {t('move')}
                </Button>
              </div>
              <div className="flex items-end gap-2">
                <Field label={t('mergeWith')} htmlFor="merge-into" className="flex-1">
                  <Select id="merge-into" value={mergeInto} onChange={(e) => setMergeInto(e.target.value)}>
                    <option value="">{t('pickTable')}</option>
                    {busyTables.map((x) => <option key={x.visit!.id} value={x.visit!.id}>{x.table.label} · {x.zoneName}</option>)}
                  </Select>
                </Field>
                <Button variant="secondary" icon={Combine} disabled={!mergeInto} loading={merging}
                  onClick={() => run(async () => { await merge({ id: visit.id, intoVisitId: mergeInto }).unwrap(); setMergeInto(''); }, t('merged'))}>
                  {t('merge')}
                </Button>
              </div>
              <p className="-mt-1 text-xs text-fg-muted">{t('mergeHint')}</p>
            </section>
          </>
        )}
      </CardBody>
    </Card>
  );
}
