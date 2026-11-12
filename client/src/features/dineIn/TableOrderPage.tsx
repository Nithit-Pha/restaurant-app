'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BellRing, ChefHat, Minus, Plus, Receipt, ShoppingBag, Trash2, UtensilsCrossed } from 'lucide-react';
import { useGetMenuItemsQuery, type MenuItem } from '../../api/apiSlice';
import type { CartOption } from '../cart/cartSlice';
import ItemOptionsDialog from '../menu/ItemOptionsDialog';
import ClosedBanner from '../orders/ClosedBanner';
import LineDetails from '../orders/LineDetails';
import OrderStatusBadge from '../orders/OrderStatusBadge';
import { formatClock } from '../orders/orderDisplay';
import { formatCurrency } from '../../lib/format';
import { newUuid } from '../../lib/uuid';
import { itemDescription, itemName } from '../../lib/localized';
import {
  Alert, Button, Card, CardBody, ChipGroup, Dialog, Drawer, EmptyState, IconButton, LoadingBlock, PageContainer, cn, useToast,
} from '../../components/ui';
import { GuestApiError, guestApi, store, type TableInfo, type Visit } from './guestApi';

interface Line {
  lineId: string;
  menuItemId: string;
  name: string;
  nameTh?: string | null;
  unitPrice: number; // estimate incl. options; the server prices the order
  quantity: number;
  options: CartOption[];
  note: string;
}

const lineKey = (id: string, options: CartOption[], note: string) => `${id}|${options.map((o) => o.id).sort().join(',')}|${note.trim()}`;
const POLL_MS = 10_000;

export default function TableOrderPage({ qrToken }: { qrToken: string }) {
  const t = useTranslations('tableOrder');
  const tc = useTranslations('common');
  const locale = useLocale();
  const toast = useToast();
  const keyStore = `visitKey:${qrToken}`;
  const cartStore = `tableCart:${qrToken}`;

  const [table, setTable] = useState<TableInfo | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [visit, setVisit] = useState<Visit | null>(null);
  const [ended, setEnded] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [choosing, setChoosing] = useState<MenuItem | null>(null);
  const [sending, setSending] = useState(false);
  const [askBill, setAskBill] = useState(false);
  const [calledAt, setCalledAt] = useState(0);
  const [category, setCategory] = useState('');
  const sendKey = useRef<string | null>(null); // one idempotency key per "send" until it succeeds
  const visitRef = useRef<HTMLDivElement>(null);

  const { data: items = [], isLoading: menuLoading } = useGetMenuItemsQuery({});

  // ------------------------------------------------------------ visit state --

  const keepKey = useCallback((k: string | null) => {
    setKey(k);
    store.set(keyStore, k);
  }, [keyStore]);

  const visitEnded = useCallback(() => {
    keepKey(null);
    setVisit(null);
    setEnded(true);
  }, [keepKey]);

  // Open the table: show its open visit, if friends already ordered.
  useEffect(() => {
    let alive = true;
    const hadKey = store.get(keyStore);
    try {
      const saved = store.get(cartStore);
      if (saved) setLines(JSON.parse(saved) as Line[]);
    } catch { /* ignore a broken saved cart */ }
    guestApi.join(qrToken)
      .then((res) => {
        if (!alive) return;
        setTable(res.table);
        if (res.key && res.visit) {
          keepKey(res.key);
          setVisit(res.visit);
        } else if (hadKey) {
          // This phone was part of a visit that has been paid since.
          visitEnded();
        }
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setInvalid(err instanceof GuestApiError && err.status === 404 ? err.message : t('loadFailed'));
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrToken]);

  // Follow the visit: statuses change as the kitchen works.
  useEffect(() => {
    if (!key) return;
    const tick = () => guestApi.visit(key).then(setVisit).catch((err: unknown) => {
      if (err instanceof GuestApiError && (err.status === 410 || err.status === 401)) visitEnded();
    });
    const id = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(id);
  }, [key, visitEnded]);

  useEffect(() => { store.set(cartStore, lines.length ? JSON.stringify(lines) : null); }, [lines, cartStore]);

  // ------------------------------------------------------------------ cart --

  const add = (item: MenuItem, options: CartOption[] = [], note = '') => {
    const id = lineKey(item.id, options, note);
    setLines((ls) => {
      const found = ls.find((l) => l.lineId === id);
      if (found) return ls.map((l) => (l.lineId === id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...ls, {
        lineId: id, menuItemId: item.id, name: item.name, nameTh: item.nameTh,
        unitPrice: Number(item.sellingPrice) + options.reduce((s, o) => s + o.priceDelta, 0),
        quantity: 1, options, note: note.trim(),
      }];
    });
    toast({ title: t('added', { name: itemName(item, locale) }) });
  };

  const setQty = (lineId: string, quantity: number) =>
    setLines((ls) => (quantity <= 0 ? ls.filter((l) => l.lineId !== lineId) : ls.map((l) => (l.lineId === lineId ? { ...l, quantity } : l))));

  const count = lines.reduce((s, l) => s + l.quantity, 0);
  const cartTotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);

  const send = async () => {
    if (!lines.length) return;
    setSending(true);
    sendKey.current ??= newUuid();
    try {
      const res = await guestApi.order(
        qrToken,
        key,
        lines.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity, modifierIds: l.options.map((o) => o.id), note: l.note || undefined })),
        sendKey.current,
      );
      sendKey.current = null;
      keepKey(res.key);
      setVisit(res.visit);
      setEnded(false);
      setLines([]);
      setCartOpen(false);
      toast({ tone: 'success', title: t('sent'), description: res.visit.confirmed ? undefined : t('sentWaiting') });
      requestAnimationFrame(() => visitRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (err) {
      toast({ tone: 'error', title: t('sendFailed'), description: err instanceof Error ? err.message : tc('tryAgain') });
    } finally {
      setSending(false);
    }
  };

  const callStaff = async () => {
    if (!key) return;
    try {
      setVisit(await guestApi.callStaff(key));
      setCalledAt(Date.now());
      toast({ title: t('staffCalled') });
    } catch (err) {
      toast({ tone: 'error', title: err instanceof Error ? err.message : tc('tryAgain') });
    }
  };

  const requestBill = async () => {
    if (!key) return;
    try {
      setVisit(await guestApi.requestBill(key));
      setAskBill(false);
      toast({ tone: 'success', title: t('billRequested') });
    } catch (err) {
      toast({ tone: 'error', title: err instanceof Error ? err.message : tc('tryAgain') });
    }
  };

  // ------------------------------------------------------------------ menu --

  const categories = useMemo(() => Array.from(new Set(items.map((i) => i.category))), [items]);
  const shown = category ? items.filter((i) => i.category === category) : items;
  const [, setNow] = useState(0);
  useEffect(() => { // re-enable "Call staff" after a minute
    if (!calledAt) return;
    const id = window.setTimeout(() => setNow(Date.now()), 60_000);
    return () => window.clearTimeout(id);
  }, [calledAt]);
  const recentlyCalled = Date.now() - calledAt < 60_000;

  if (invalid) {
    return (
      <PageContainer>
        <EmptyState icon={UtensilsCrossed} title={t('invalidTitle')} description={invalid} />
      </PageContainer>
    );
  }
  if (!table) return <PageContainer><LoadingBlock label={tc('loadingDots')} /></PageContainer>;

  return (
    <PageContainer className="pb-28">
      <header className="mb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">{table.zoneName}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{t('title', { table: table.label })}</h1>
        <p className="mt-1 text-sm text-fg-muted">{t('intro')}</p>
      </header>

      <ClosedBanner className="mb-4" />

      {ended && (
        <Alert tone="success" title={t('endedTitle')} className="mb-4">{t('endedText')}</Alert>
      )}

      {visit && (
        <div ref={visitRef} className="mb-6 scroll-mt-20">
          <Card>
            <CardBody className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-fg">{t('yourTable')}</h2>
                <span className="text-sm font-semibold tabular-nums text-fg">{t('soFar', { total: formatCurrency(visit.totals.total) })}</span>
              </div>
              {visit.billRequestedAt ? (
                <Alert tone="info">{t('billOnTheWay')}</Alert>
              ) : !visit.confirmed ? (
                <Alert tone="warning">{t('waitingForStaff')}</Alert>
              ) : null}

              <ol className="flex flex-col gap-3">
                {visit.orders.map((o, i) => (
                  <li key={o.id} className={cn('rounded-control border border-line p-3', o.status === 'CANCELLED' && 'opacity-60')}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-fg">
                        {t('round', { n: i + 1 })} <span className="font-normal text-fg-muted">· {formatClock(o.createdAt)}</span>
                      </span>
                      <OrderStatusBadge status={o.status} type="DINE_IN" />
                    </div>
                    <ul className="space-y-1 text-sm">
                      {o.items.map((l) => (
                        <li key={l.id}>
                          <div className="flex justify-between gap-3">
                            <span><span className="tabular-nums text-fg-muted">{l.quantity}×</span> {l.name}</span>
                            <span className="tabular-nums text-fg-muted">{formatCurrency(l.unitPrice * l.quantity)}</span>
                          </div>
                          <LineDetails options={l.options} note={l.note} className="ml-6 text-xs" />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" icon={BellRing} onClick={callStaff} disabled={recentlyCalled}>
                  {recentlyCalled ? t('staffComing') : t('callStaff')}
                </Button>
                <Button variant="secondary" icon={Receipt} onClick={() => setAskBill(true)} disabled={Boolean(visit.billRequestedAt) || !visit.orders.length}>
                  {visit.billRequestedAt ? t('billAsked') : t('requestBill')}
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      <h2 className="mb-3 text-lg font-semibold text-fg">{t('menu')}</h2>
      {categories.length > 1 && (
        <ChipGroup
          className="mb-4"
          label={t('categories')}
          value={category}
          onChange={setCategory}
          options={[{ value: '', label: t('all') }, ...categories.map((c) => ({ value: c, label: c }))]}
        />
      )}
      {menuLoading ? (
        <LoadingBlock label={tc('loadingDots')} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {shown.map((item) => {
            const name = itemName(item, locale);
            const description = itemDescription(item, locale);
            return (
              <li key={item.id} className="flex gap-3 rounded-card border border-line bg-surface p-3">
                {item.imageUrl && <img src={item.imageUrl} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded-control object-cover" />}
                <div className="flex min-w-0 flex-1 flex-col">
                  <h3 className="font-medium leading-snug text-fg">{name}</h3>
                  {description && <p className="mt-0.5 line-clamp-2 text-sm text-fg-muted">{description}</p>}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                    <span className="font-semibold tabular-nums text-fg">{formatCurrency(item.sellingPrice)}</span>
                    <Button size="sm" variant="secondary" icon={Plus} aria-label={t('addLabel', { name })}
                      onClick={() => (item.modifierGroups?.length ? setChoosing(item) : add(item))}>
                      {t('add')}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Bottom bar: the round being put together */}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
          <div className="mx-auto flex max-w-5xl items-center gap-3">
            <span className="flex-1 text-sm text-fg">
              <span className="font-semibold">{t('itemsCount', { count })}</span>
              <span className="text-fg-muted"> · {formatCurrency(cartTotal)}</span>
            </span>
            <Button icon={ShoppingBag} onClick={() => setCartOpen(true)}>{t('reviewOrder')}</Button>
          </div>
        </div>
      )}

      <Drawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        title={t('newRound')}
        width="max-w-md"
        footer={
          <div className="flex flex-col gap-3">
            <div className="flex justify-between text-sm font-semibold text-fg">
              <span>{t('roundTotal')}</span>
              <span className="tabular-nums">{formatCurrency(cartTotal)}</span>
            </div>
            <p className="text-xs text-fg-muted">{t('payAtCounter')}</p>
            <Button icon={ChefHat} fullWidth size="lg" loading={sending} disabled={!lines.length} onClick={send}>
              {t('sendToKitchen')}
            </Button>
          </div>
        }
      >
        <ul className="divide-y divide-line">
          {lines.map((l) => (
            <li key={l.lineId} className="flex items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-fg">{itemName({ name: l.name, nameTh: l.nameTh }, locale)}</p>
                <LineDetails options={l.options} note={l.note} className="text-xs" />
                <p className="mt-1 text-sm tabular-nums text-fg-muted">{formatCurrency(l.unitPrice * l.quantity)}</p>
              </div>
              <div className="flex items-center gap-1">
                <IconButton icon={l.quantity === 1 ? Trash2 : Minus} size="sm" variant="secondary"
                  label={l.quantity === 1 ? t('remove') : t('less')} onClick={() => setQty(l.lineId, l.quantity - 1)} />
                <span className="w-6 text-center text-sm font-semibold tabular-nums" aria-live="polite">{l.quantity}</span>
                <IconButton icon={Plus} size="sm" variant="secondary" label={t('more')} onClick={() => setQty(l.lineId, l.quantity + 1)} />
              </div>
            </li>
          ))}
        </ul>
      </Drawer>

      {choosing && (
        <ItemOptionsDialog
          item={choosing}
          onAdd={(options, note) => { add(choosing, options, note); setChoosing(null); }}
          onClose={() => setChoosing(null)}
        />
      )}

      <Dialog
        open={askBill}
        onClose={() => setAskBill(false)}
        size="sm"
        title={t('billTitle')}
        description={visit ? t('billDescription', { total: formatCurrency(visit.totals.total) }) : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAskBill(false)}>{tc('cancel')}</Button>
            <Button icon={Receipt} onClick={requestBill}>{t('requestBill')}</Button>
          </>
        }
      />
    </PageContainer>
  );
}
