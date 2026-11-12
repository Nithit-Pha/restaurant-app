'use client';

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Armchair, BellRing, ChefHat, Receipt, UserCheck } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useGetFloorViewQuery, useGetMeQuery, type DiningTable, type VisitBrief } from '../../../../src/api/apiSlice';
import { useLiveConnected } from '../../../../src/components/LiveUpdates';
import FloorCanvas from '../../../../src/features/admin/tables/FloorCanvas';
import TablePanel from '../../../../src/features/dineIn/TablePanel';
import { STATUS_FILL, STATUS_ORDER, needsAttention } from '../../../../src/features/dineIn/tableStatus';
import { useRequireRole } from '../../../../src/routes/useAuthGuard';
import { EmptyState, LoadingBlock, PageContainer, PageHeader, buttonClasses, cn } from '../../../../src/components/ui';

export default function FloorViewPage() {
  const t = useTranslations('floorView');
  const tf = useTranslations('floorPlan');
  const locale = useLocale();
  const { ready } = useRequireRole('STAFF');
  const live = useLiveConnected();
  // Live updates reload the floor on every change; polling is the fallback when they are down.
  const { data, isLoading } = useGetFloorViewQuery(undefined, { skip: !ready, pollingInterval: live ? 120_000 : 15_000 });
  const { data: me } = useGetMeQuery(undefined, { skip: !ready });
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [, tick] = useState(0);
  useEffect(() => { // minutes seated move on
    const id = window.setInterval(() => tick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const zones = data?.zones ?? [];
  const zone = zones.find((z) => z.id === zoneId) ?? zones[0];
  const visitByTable = useMemo(() => new Map((data?.visits ?? []).map((v) => [v.tableId, v])), [data?.visits]);
  const allTables = useMemo(
    () => zones.flatMap((z) => z.tables.map((table) => ({ table, zoneName: z.name, visit: visitByTable.get(table.id) }))),
    [zones, visitByTable],
  );
  const selectedEntry = allTables.find((x) => x.table.id === selected);

  // Tables that need someone now, across all zones.
  const attention = allTables
    .filter((x) => needsAttention(x.visit))
    .sort((a, b) => Number(Boolean(b.visit!.staffCalledAt)) - Number(Boolean(a.visit!.staffCalledAt)));

  const reason = (v: VisitBrief) =>
    v.staffCalledAt ? { icon: BellRing, text: t('reasonCalled'), tone: 'text-danger' }
      : v.billRequestedAt ? { icon: Receipt, text: t('reasonBill'), tone: 'text-accent' }
        : !v.confirmed ? { icon: UserCheck, text: t('reasonNew'), tone: 'text-warning' }
          : { icon: ChefHat, text: t('reasonReady', { count: v.orders.ready }), tone: 'text-success' };

  const select = (tableId: string) => {
    setSelected(tableId);
    const z = zones.find((zz) => zz.tables.some((tb) => tb.id === tableId));
    if (z) setZoneId(z.id);
  };

  if (!ready) return null;

  return (
    <PageContainer wide>
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={
          <span className="inline-flex items-center gap-2">
            <span className={cn('h-2 w-2 rounded-full', live ? 'bg-success' : 'bg-line-strong')} aria-hidden />
            {live ? t('live') : t('notLive')}
          </span>
        }
        actions={me?.role === 'SUPER_ADMIN' ? <Link href="/admin/tables" className={buttonClasses('secondary')}>{t('editPlan')}</Link> : undefined}
      />

      {isLoading ? (
        <LoadingBlock label={t('loading')} />
      ) : !zone ? (
        <EmptyState icon={Armchair} title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <>
          {attention.length > 0 && (
            <section aria-label={t('attention')} className="mb-4 flex flex-wrap gap-2">
              {attention.map(({ table, visit }) => {
                const r = reason(visit!);
                return (
                  <button key={table.id} type="button" onClick={() => select(table.id)}
                    className="inline-flex items-center gap-2 rounded-control border border-line bg-surface px-3 py-1.5 text-sm hover:bg-surface-hover">
                    <r.icon size={16} className={r.tone} aria-hidden />
                    <span className="font-semibold text-fg">{table.label}</span>
                    <span className="text-fg-muted">{r.text}</span>
                  </button>
                );
              })}
            </section>
          )}

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div role="tablist" aria-label={tf('zones')} className="flex flex-wrap gap-1 rounded-control border border-line bg-surface-muted p-0.5">
              {zones.map((z) => (
                <button key={z.id} type="button" role="tab" aria-selected={z.id === zone.id} onClick={() => setZoneId(z.id)}
                  className={cn('h-8 rounded-[5px] px-3 text-sm font-medium transition-colors',
                    z.id === zone.id ? 'bg-surface text-fg shadow-soft' : 'text-fg-muted hover:text-fg')}>
                  {z.name}
                  <span className="ml-1.5 text-xs font-normal text-fg-muted">
                    {z.tables.filter((tb) => visitByTable.has(tb.id)).length}/{z.tables.length}
                  </span>
                </button>
              ))}
            </div>
            <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-muted" aria-label={t('legend')}>
              {STATUS_ORDER.map((s) => (
                <li key={s} className="inline-flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-sm border border-line-strong" style={{ background: STATUS_FILL[s] }} aria-hidden />
                  {t(`status.${s}`)}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-4 xl:flex-row">
            <div className="min-w-0 flex-1 overflow-hidden rounded-card border border-line bg-surface p-2">
              <FloorCanvas
                zone={zone}
                tables={zone.tables.map((tb) => ({ ...tb, key: tb.id }))}
                decor={(zone.decor ?? []).map((d, i) => ({ ...d, key: `d${i}` }))}
                selectedKey={selected}
                itemCursor="pointer"
                tableFill={(tb) => STATUS_FILL[(tb as unknown as DiningTable).status]}
                tableAlert={(tb) => needsAttention(visitByTable.get(tb.key))}
                tableNote={(tb) => {
                  const v = visitByTable.get(tb.key);
                  // Short: whole baht, the panel shows the exact amount.
                  return v ? `฿${Math.round(v.total).toLocaleString('en-US')}` : undefined;
                }}
                tableLabel={(tb) => {
                  const v = visitByTable.get(tb.key);
                  const status = t(`status.${(tb as unknown as DiningTable).status}`);
                  return `${t('tableTitle', { label: tb.label })}, ${status}${v && needsAttention(v) ? `, ${reason(v).text}` : ''}`;
                }}
                decorLabel={(type) => tf(`decor.${type}`)}
                className="block h-auto w-full select-none"
                onItemPointerDown={(e, kind, key) => { if (kind === 'table') { e.preventDefault(); setSelected(key); } }}
                onItemKeyDown={(e: KeyboardEvent, kind, key) => {
                  if (kind === 'table' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setSelected(key); }
                }}
              />
            </div>
            {selectedEntry ? (
              <TablePanel
                key={selectedEntry.table.id}
                table={selectedEntry.table}
                zoneName={selectedEntry.zoneName}
                visit={selectedEntry.visit}
                allTables={allTables}
                locale={locale}
              />
            ) : (
              <p className="text-sm text-fg-muted xl:w-96">{t('pickHint')}</p>
            )}
          </div>
        </>
      )}
    </PageContainer>
  );
}
