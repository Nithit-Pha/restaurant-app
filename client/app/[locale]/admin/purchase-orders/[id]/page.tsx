'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, Ban, CheckCheck, Download, PackageCheck, Receipt, RotateCcw, Save, SearchX, Send } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { apiErrorMessage } from '@/lib/localized';
import { useGetMeQuery, useGetRestaurantQuery } from '../../../../../src/api/apiSlice';
import PricesDialog from '../../../../../src/features/admin/purchasing/PricesDialog';
import ReceiveDialog from '../../../../../src/features/admin/purchasing/ReceiveDialog';
import { formatAmount, useGetIngredientsQuery, type Ingredient, type Unit } from '../../../../../src/features/admin/stock/stockApi';
import { downloadOrderPdf } from '../../../../../src/features/admin/purchasing/orderPdf';
import { buildOrderSheet, packText, STATUS_TONE } from '../../../../../src/features/admin/purchasing/poDisplay';
import {
  useCancelPurchaseOrderMutation, useCompletePurchaseOrderMutation, useGetPurchaseOrderQuery, useSendPurchaseOrderMutation,
  useUpdatePurchaseOrderMutation, type PoLine, type PurchaseDelivery, type PurchaseOrder,
} from '../../../../../src/features/admin/purchasing/purchasingApi';
import { orderDayLabel } from '../../../../../src/features/admin/suppliers/orderDays';
import { formatCurrency, formatDate } from '../../../../../src/lib/format';
import { useRequireRole } from '../../../../../src/routes/useAuthGuard';
import {
  Alert, Badge, Button, Card, CardHeader, Dialog, EmptyState, Field, Input, LoadingBlock, PageContainer, PageHeader,
  Table, TBody, TD, TH, THead, TR, Textarea, checkboxClasses, cn, useToast,
} from '../../../../../src/components/ui';

interface Row {
  ingredientId: string;
  name: string;
  unit: Unit;
  packName: string | null;
  packSize: string;
  ingredient?: Ingredient; // current stock, when the ingredient still exists
  orderedPacks?: number; // on the saved order
  received?: string; // arrived so far (sent orders)
}

interface LineEdit { ticked: boolean; packs: string }

/**
 * Owner: check a purchase order, tick what goes in, send it and get the PDF.
 * Staff: see sent orders and record deliveries (Step 3d).
 */
export default function PurchaseOrderPage() {
  const t = useTranslations('purchasing');
  const { ready } = useRequireRole('STAFF');
  const { data: me } = useGetMeQuery(undefined, { skip: !ready });
  const params = useParams<{ id: string }>();
  const { data: po, isLoading, isError } = useGetPurchaseOrderQuery(params.id, { skip: !ready });
  const { data: ingredients = [] } = useGetIngredientsQuery(undefined, { skip: !ready });

  if (!ready) return null;
  if (isLoading) return <PageContainer><LoadingBlock label={t('loading')} /></PageContainer>;
  if (isError || !po) {
    return (
      <PageContainer>
        <EmptyState icon={SearchX} title={t('notFound')} action={<Link href="/admin/purchase-orders" className="text-sm font-medium text-accent underline">{t('backToList')}</Link>} />
      </PageContainer>
    );
  }
  // A fresh editor after every save, so its edits always start from the saved order.
  return <Editor key={po.updatedAt} po={po} ingredients={ingredients} isOwner={me?.role === 'SUPER_ADMIN'} />;
}

function Editor({ po, ingredients, isOwner }: { po: PurchaseOrder; ingredients: Ingredient[]; isOwner: boolean }) {
  const t = useTranslations('purchasing');
  const ts = useTranslations('stock');
  const tc = useTranslations('common');
  const locale = useLocale();
  const toast = useToast();
  const { data: restaurant } = useGetRestaurantQuery();
  const [update, { isLoading: saving }] = useUpdatePurchaseOrderMutation();
  const [send, { isLoading: sending }] = useSendPurchaseOrderMutation();
  const [cancel, { isLoading: cancelling }] = useCancelPurchaseOrderMutation();
  const [complete, { isLoading: completing }] = useCompletePurchaseOrderMutation();
  // Only the owner edits a draft; staff see it read-only.
  const draft = po.status === 'DRAFT' && isOwner;
  const receivable = po.status === 'SENT' || po.status === 'PARTLY_RECEIVED';
  const [receiving, setReceiving] = useState(false);
  const [pricing, setPricing] = useState<{ delivery: PurchaseDelivery; no: number } | null>(null);
  const unit = (u: string) => ts(`unit.${u}`);

  const [edits, setEdits] = useState<Record<string, LineEdit>>({});
  const [expectedDate, setExpectedDate] = useState(po.expectedDate ?? '');
  const [note, setNote] = useState(po.note ?? '');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<'send' | 'cancel' | 'complete' | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  // Drafts list every ingredient of the supplier (ticked or not); other orders only their lines.
  const rows = useMemo<Row[]>(() => {
    const byId = new Map(ingredients.map((i) => [i.id, i]));
    const list: Row[] = po.items.map((it) => ({
      ingredientId: it.ingredientId, name: it.ingredientName, unit: it.unit, packName: it.packName, packSize: it.packSize,
      ingredient: byId.get(it.ingredientId), orderedPacks: it.packs, received: it.received,
    }));
    if (draft) {
      const onOrder = new Set(po.items.map((i) => i.ingredientId));
      ingredients
        .filter((i) => i.supplierId === po.supplier.id && i.isActive && !onOrder.has(i.id))
        .forEach((i) => list.push({ ingredientId: i.id, name: i.name, unit: i.unit, packName: i.packName, packSize: i.packSize, ingredient: i }));
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, locale, { numeric: true }));
  }, [po, ingredients, draft, locale]);

  const suggested = (r: Row) => r.ingredient?.orderPacks ?? 0;
  const lineOf = (r: Row): LineEdit => edits[r.ingredientId]
    ?? { ticked: r.orderedPacks !== undefined, packs: String(r.orderedPacks ?? (suggested(r) || 1)) };
  const setLine = (r: Row, change: Partial<LineEdit>) => setEdits((e) => ({ ...e, [r.ingredientId]: { ...lineOf(r), ...change } }));

  const lines: PoLine[] = rows
    .map((r) => ({ r, l: lineOf(r) }))
    .filter(({ l }) => l.ticked)
    .map(({ r, l }) => ({ ingredientId: r.ingredientId, packs: Number(l.packs) }));
  const badPacks = lines.some((l) => !Number.isInteger(l.packs) || l.packs < 1 || l.packs > 9999);
  const savedLines = po.items.map((i) => `${i.ingredientId}:${i.packs}`).sort().join();
  const linesChanged = lines.map((l) => `${l.ingredientId}:${l.packs}`).sort().join() !== savedLines;
  const dirty = draft && (linesChanged || expectedDate !== (po.expectedDate ?? '') || note.trim() !== (po.note ?? ''));
  const totalPacks = lines.reduce((sum, l) => sum + (Number.isFinite(l.packs) ? l.packs : 0), 0);

  const applySuggestion = () => setEdits(Object.fromEntries(rows.map((r) => [
    r.ingredientId, { ticked: suggested(r) > 0, packs: String(suggested(r) || 1) },
  ])));

  /** Saves the draft; returns the saved order, or null when it failed. */
  const save = async (): Promise<PurchaseOrder | null> => {
    setError('');
    if (badPacks) { setError(t('packsInvalid')); return null; }
    try {
      return await update({ id: po.id, items: lines, expectedDate: expectedDate || null, note: note.trim() || null }).unwrap();
    } catch (err) {
      setError(apiErrorMessage(err, locale, t('saveFailed')));
      return null;
    }
  };

  const pdf = async (order: PurchaseOrder) => {
    setPdfBusy(true);
    try {
      await downloadOrderPdf(buildOrderSheet(order, restaurant, t, unit, locale));
    } catch {
      setError(t('pdfFailed'));
    } finally {
      setPdfBusy(false);
    }
  };

  const onSave = async () => {
    if (await save()) toast({ title: t('saved', { number: po.label }) });
  };

  const onSend = async () => {
    setConfirm(null);
    if (dirty && !(await save())) return;
    try {
      const sent = await send(po.id).unwrap();
      toast({ title: t('sentToast', { number: po.label }), description: t('sentToastHint', { supplier: po.supplier.name }) });
      await pdf(sent);
    } catch (err) {
      setError(apiErrorMessage(err, locale, t('sendFailed')));
    }
  };

  const onComplete = async () => {
    setConfirm(null);
    try {
      await complete(po.id).unwrap();
      toast({ title: t('completedToast', { number: po.label }) });
    } catch (err) {
      setError(apiErrorMessage(err, locale, t('completeFailed')));
    }
  };

  const onCancel = async () => {
    setConfirm(null);
    try {
      await cancel(po.id).unwrap();
      toast({ title: t('cancelledToast', { number: po.label }) });
    } catch (err) {
      setError(apiErrorMessage(err, locale, t('cancelFailed')));
    }
  };

  const s = po.supplier;
  const contact = [s.contactName, s.phone, s.lineId && `LINE ${s.lineId}`, s.email].filter(Boolean).join(' · ');

  return (
    <PageContainer wide>
      <Link href="/admin/purchase-orders" className="mb-3 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft size={16} aria-hidden /> {t('backToList')}
      </Link>
      <PageHeader
        eyebrow={t('eyebrow')}
        title={`${po.label} · ${s.name}`}
        description={[
          po.orderDay ? t('orderDayLine', { day: orderDayLabel(po.orderDay, locale) }) : t(`source.${po.source}`),
          po.sentAt ? t('sentLine', { when: formatDate(po.sentAt, locale), name: po.sentBy?.name ?? '—' }) : t('createdLine', { when: formatDate(po.createdAt, locale) }),
        ].join(' · ')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[po.status]}>{t(`status.${po.status}`)}</Badge>
            {po.status !== 'CANCELLED' && (
              <Button variant="secondary" icon={Download} loading={pdfBusy} disabled={dirty} onClick={() => pdf(po)}>{t('downloadPdf')}</Button>
            )}
            {draft && <Button variant="secondary" icon={Save} loading={saving} disabled={!dirty} onClick={onSave}>{t('save')}</Button>}
            {draft && <Button icon={Send} loading={sending} disabled={lines.length === 0} onClick={() => setConfirm('send')}>{t('send')}</Button>}
            {receivable && <Button icon={PackageCheck} onClick={() => setReceiving(true)}>{t('receive.open')}</Button>}
          </div>
        }
      />

      {error && <Alert tone="danger" className="mb-4">{error}</Alert>}
      {!s.isActive && draft && <Alert tone="warning" className="mb-4">{t('supplierOff')}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card className="overflow-hidden">
          <CardHeader
            title={t('linesTitle', { count: lines.length })}
            description={draft ? t('linesHintDraft') : undefined}
            actions={draft && rows.length > 0 ? <Button variant="ghost" size="sm" icon={RotateCcw} onClick={applySuggestion}>{t('useSuggestion')}</Button> : undefined}
          />
          {rows.length === 0 ? (
            <EmptyState icon={SearchX} title={t('noLines')} description={draft ? t('noLinesHint') : undefined} />
          ) : (
            <Table>
              <THead>
                <tr>
                  {draft && <TH className="w-10"><span className="sr-only">{t('col.tick')}</span></TH>}
                  <TH>{t('col.ingredient')}</TH>
                  <TH numeric className="hidden sm:table-cell">{t('col.inStock')}</TH>
                  <TH numeric>{t('col.packs')}</TH>
                  <TH numeric className="hidden sm:table-cell">{t('col.amount')}</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((r) => {
                  const l = lineOf(r);
                  const packs = Number(l.packs);
                  const ing = r.ingredient;
                  const inputId = `packs-${r.ingredientId}`;
                  return (
                    <TR key={r.ingredientId} className={cn(draft && !l.ticked && 'text-fg-muted')}>
                      {draft && (
                        <TD>
                          <input
                            type="checkbox"
                            className={checkboxClasses}
                            checked={l.ticked}
                            onChange={(e) => setLine(r, { ticked: e.target.checked })}
                            aria-label={t('tickFor', { name: r.name })}
                          />
                        </TD>
                      )}
                      <TD className="py-2.5">
                        <p className={cn('font-medium', (!draft || l.ticked) && 'text-fg')}>{r.name}</p>
                        <p className="text-xs text-fg-muted">
                          {t('perPack', { pack: packText(r.packName, r.packSize, unit(r.unit), locale) })}
                          {draft && suggested(r) > 0 && <> · {t('suggested', { count: suggested(r) })}</>}
                        </p>
                      </TD>
                      <TD numeric className="hidden sm:table-cell">
                        {ing ? (
                          <div className="flex items-center justify-end gap-2">
                            {ing.low && <Badge tone={ing.emergency || Number(ing.quantity) <= 0 ? 'danger' : 'warning'}>{ing.emergency ? ts('emergency') : ts('low')}</Badge>}
                            <span className="tabular-nums">{formatAmount(ing.quantity, locale)} {unit(ing.unit)}</span>
                          </div>
                        ) : '—'}
                      </TD>
                      <TD numeric>
                        {draft ? (
                          <Input
                            id={inputId}
                            type="number"
                            min="1"
                            max="9999"
                            step="1"
                            inputMode="numeric"
                            value={l.packs}
                            disabled={!l.ticked}
                            onChange={(e) => setLine(r, { packs: e.target.value })}
                            aria-label={t('packsFor', { name: r.name })}
                            className="ml-auto h-9 w-20 text-right tabular-nums"
                          />
                        ) : (
                          <span className="font-semibold tabular-nums">{r.orderedPacks}</span>
                        )}
                      </TD>
                      <TD numeric muted className="hidden sm:table-cell tabular-nums whitespace-nowrap">
                        {(!draft || l.ticked) && Number.isFinite(packs) && packs > 0
                          ? `${formatAmount(packs * Number(r.packSize), locale)} ${unit(r.unit)}`
                          : '—'}
                        {r.received !== undefined && po.deliveries.length > 0 && (
                          <p className={cn('text-xs', Number(r.received) >= packs * Number(r.packSize) - 1e-9 ? 'text-success' : 'text-fg-muted')}>
                            {t('receivedSoFar', { amount: formatAmount(r.received, locale) })}
                          </p>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-fg">{s.name}</h2>
            {contact && <p className="mt-1 text-sm text-fg-muted">{contact}</p>}
            {s.address && <p className="mt-1 text-sm text-fg-muted">{s.address}</p>}
            {s.note && <p className="mt-2 text-xs text-fg-muted">{s.note}</p>}
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-fg-muted">{t('summary.lines')}</dt><dd className="tabular-nums text-fg">{lines.length}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-fg-muted">{t('summary.packs')}</dt><dd className="tabular-nums text-fg">{totalPacks}</dd></div>
              {s.cutOffTime && <div className="flex justify-between gap-3"><dt className="text-fg-muted">{t('summary.cutOff')}</dt><dd className="text-fg">{s.cutOffTime}</dd></div>}
            </dl>
          </Card>

          <Card className="space-y-4 p-4">
            {draft ? (
              <>
                <Field label={t('field.expectedDate')} htmlFor="po-date" hint={t('field.expectedDateHint', { count: s.leadTimeDays })}>
                  <Input id="po-date" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
                </Field>
                <Field label={t('field.note')} htmlFor="po-note" hint={t('field.noteHint')}>
                  <Textarea id="po-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
              </>
            ) : (
              <dl className="space-y-2 text-sm">
                <div><dt className="text-fg-muted">{t('field.expectedDate')}</dt><dd className="text-fg">{po.expectedDate ? orderDayLabel(po.expectedDate, locale) : '—'}</dd></div>
                <div><dt className="text-fg-muted">{t('field.note')}</dt><dd className="whitespace-pre-line text-fg">{po.note || '—'}</dd></div>
              </dl>
            )}
          </Card>

          {isOwner && po.status === 'PARTLY_RECEIVED' && (
            <Button variant="secondary" icon={CheckCheck} loading={completing} onClick={() => setConfirm('complete')} className="w-full">
              {t('complete')}
            </Button>
          )}
          {isOwner && (po.status === 'DRAFT' || po.status === 'SENT') && (
            <Button variant="ghost" icon={Ban} loading={cancelling} onClick={() => setConfirm('cancel')} className="w-full hover:!bg-danger-soft hover:!text-danger">
              {t('cancelOrder')}
            </Button>
          )}
        </div>
      </div>

      {po.deliveries.length > 0 && (
        <Card className="mt-6 overflow-hidden">
          <CardHeader title={t('deliveries.title', { count: po.deliveries.length })} description={isOwner ? t('deliveries.hintOwner') : undefined} />
          <ul className="divide-y divide-line">
            {po.deliveries.map((d, k) => (
              <li key={d.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">
                    {t('deliveries.line', { no: k + 1, when: formatDate(d.receivedAt, locale), name: d.receivedBy?.name ?? '—' })}
                  </p>
                  <p className="text-sm text-fg-muted">
                    {d.lines.map((l) => `${l.purchaseOrderItem.ingredientName} ${formatAmount(l.amount, locale)} ${unit(l.purchaseOrderItem.unit)}`).join(' · ')}
                  </p>
                  {d.note && <p className="text-xs text-fg-muted">{d.note}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {d.priceTotal === null
                    ? <Badge tone="warning">{t('deliveries.priceMissing')}</Badge>
                    : isOwner && <span className="text-sm font-semibold tabular-nums text-fg">{formatCurrency(Number(d.priceTotal))}</span>}
                  {isOwner && (
                    <Button variant="secondary" size="sm" icon={Receipt} onClick={() => setPricing({ delivery: d, no: k + 1 })}>
                      {d.priceTotal === null ? t('deliveries.addPrice') : t('deliveries.editPrice')}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {receiving && <ReceiveDialog po={po} isOwner={isOwner} onDone={() => setReceiving(false)} />}
      {pricing && (
        <PricesDialog
          poId={po.id}
          delivery={pricing.delivery}
          title={t('prices.title', { number: po.label, no: pricing.no })}
          onDone={() => setPricing(null)}
        />
      )}

      {confirm && (
        <Dialog
          open
          size="sm"
          onClose={() => setConfirm(null)}
          title={t(confirm === 'send' ? 'confirmSendTitle' : confirm === 'complete' ? 'confirmCompleteTitle' : 'confirmCancelTitle', { number: po.label })}
          description={confirm === 'send' ? t('confirmSendText', { supplier: s.name, count: lines.length }) : confirm === 'complete' ? t('confirmCompleteText') : t('confirmCancelText')}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirm(null)}>{tc('cancel')}</Button>
              {confirm === 'send' && <Button icon={Send} onClick={onSend}>{t('confirmSend')}</Button>}
              {confirm === 'complete' && <Button icon={CheckCheck} onClick={onComplete}>{t('complete')}</Button>}
              {confirm === 'cancel' && <Button variant="danger" icon={Ban} onClick={onCancel}>{t('confirmCancel')}</Button>}
            </>
          }
        />
      )}
    </PageContainer>
  );
}
