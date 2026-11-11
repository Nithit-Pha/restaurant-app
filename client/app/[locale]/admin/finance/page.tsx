'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Plus, ReceiptText, RotateCw } from 'lucide-react';
import { useGetDashboardQuery } from '../../../../src/features/admin/finance/financeApi';
import ExpenseModal, { useCategoryLabel } from '../../../../src/features/admin/finance/ExpenseModal';
import { useRequireRole } from '../../../../src/routes/useAuthGuard';
import { bangkokDateISO, formatCurrency, TIME_ZONE } from '../../../../src/lib/format';
import {
  Alert, Badge, Button, Card, CardHeader, ChipGroup, EmptyState, Input, PageContainer, PageHeader, Skeleton, Stat,
  Table, TBody, TD, TH, THead, TR, cn,
} from '../../../../src/components/ui';

// ---- date helpers ------------------------------------------------------
// Calendar arithmetic on the Bangkok date, done in UTC so the device's own
// time zone cannot shift a day.
const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);

function presetRange(preset: string): { startDate?: string; endDate?: string } {
  const [y, m, d] = bangkokDateISO().split('-').map(Number);
  switch (preset) {
    case 'this_month':
      return { startDate: day(y, m, 1), endDate: day(y, m + 1, 0) };
    case 'last_month':
      return { startDate: day(y, m - 1, 1), endDate: day(y, m, 0) };
    case 'last_30':
      return { startDate: day(y, m, d - 29), endDate: day(y, m, d) };
    case 'ytd':
      return { startDate: day(y, 1, 1), endDate: day(y, m, d) };
    default:
      return {};
  }
}

const PRESETS = ['this_month', 'last_month', 'last_30', 'ytd', 'custom'] as const;

const money = formatCurrency;

export default function FinancialDashboard() {
  const t = useTranslations('finance');
  const locale = useLocale();
  const categoryLabel = useCategoryLabel();
  const { ready } = useRequireRole('SUPER_ADMIN');
  const [preset, setPreset] = useState<string>('this_month');
  const [custom, setCustom] = useState<{ startDate: string; endDate: string }>(() => ({
    startDate: presetRange('this_month').startDate!,
    endDate: bangkokDateISO(),
  }));
  const [modalOpen, setModalOpen] = useState(false);

  const range = useMemo(
    () => (preset === 'custom' ? custom : presetRange(preset)),
    [preset, custom],
  );

  const { data, isLoading, isFetching, isError, refetch } = useGetDashboardQuery(range, { skip: !ready });

  const k = data?.kpis;
  const byCategory = useMemo(
    () => [...(data?.expensesByCategory ?? [])].filter((e) => e.amount > 0).sort((a, b) => b.amount - a.amount),
    [data],
  );
  const maxCategory = byCategory[0]?.amount ?? 0;

  if (!ready) return null;

  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: TIME_ZONE,
    });

  const rangeText = range.startDate && range.endDate ? `${fmtDate(range.startDate)} – ${fmtDate(range.endDate)}` : t('allTime');

  return (
    <PageContainer wide>
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={
          <span className="tabular-nums">
            {t('subtitle', { range: rangeText })}
            {isFetching && !isLoading ? ` · ${t('refreshing')}` : ''}
          </span>
        }
        actions={<Button icon={Plus} onClick={() => setModalOpen(true)}>{t('addExpense')}</Button>}
      />

      {/* Period */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <ChipGroup label={t('period')} value={preset} onChange={setPreset} options={PRESETS.map((p) => ({ value: p, label: t(`preset.${p}`) }))} />
        {preset === 'custom' && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              aria-label={t('from')}
              value={custom.startDate}
              max={custom.endDate}
              onChange={(e) => setCustom((c) => ({ ...c, startDate: e.target.value }))}
              className="!h-9 !w-auto"
            />
            <span className="text-sm text-fg-muted">{t('to')}</span>
            <Input
              type="date"
              aria-label={t('toLabel')}
              value={custom.endDate}
              min={custom.startDate}
              max={bangkokDateISO()}
              onChange={(e) => setCustom((c) => ({ ...c, endDate: e.target.value }))}
              className="!h-9 !w-auto"
            />
          </div>
        )}
      </div>

      {isError && (
        <Alert
          tone="danger"
          className="mb-6"
          action={<Button variant="secondary" size="sm" icon={RotateCw} onClick={() => refetch()}>{t('retry')}</Button>}
        >
          {t('loadFailed')}
        </Alert>
      )}

      {/* Summary figures */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading || !k ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[6.5rem] rounded-card" />)
        ) : (
          <>
            <Stat label={t('revenue')} value={money(k.totalRevenue)} note={t('revenueNote', { count: k.orderCount })} />
            <Stat label={t('cogs')} value={money(k.totalCOGS)} note={t('grossMargin', { pct: k.grossMarginPct })} />
            <Stat label={t('opex')} value={money(k.totalOperatingExpenses)} note={t('expenseCount', { count: k.expenseCount })} />
            <Stat
              label={t('netProfit')}
              value={<span className={k.netProfit >= 0 ? 'text-success' : 'text-danger'}>{money(k.netProfit)}</span>}
              note={t('grossProfit', { amount: money(k.grossProfit) })}
              className={cn(k.netProfit < 0 && 'border-danger/40')}
            />
          </>
        )}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Transactions */}
        <Card className="overflow-hidden">
          <CardHeader title={t('transactions')} description={t('transactionsDescription')} />
          {!isLoading && data?.transactions.length === 0 ? (
            <EmptyState icon={ReceiptText} title={t('noTransactions')} />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>{t('col.date')}</TH>
                  <TH>{t('col.type')}</TH>
                  <TH>{t('col.detail')}</TH>
                  <TH className="hidden md:table-cell">{t('col.category')}</TH>
                  <TH numeric>{t('col.amount')}</TH>
                </tr>
              </THead>
              <TBody>
                {data?.transactions.map((tx) => (
                  <TR key={`${tx.kind}-${tx.id}`} className="hover:bg-surface-hover">
                    <TD muted className="whitespace-nowrap tabular-nums">{fmtDate(tx.date)}</TD>
                    <TD>
                      <Badge tone={tx.kind === 'ORDER' ? 'success' : 'danger'}>{tx.kind === 'ORDER' ? t('revenueBadge') : t('expenseBadge')}</Badge>
                    </TD>
                    <TD className="max-w-xs truncate">{tx.label}</TD>
                    <TD muted className="hidden md:table-cell">{categoryLabel(tx.category)}</TD>
                    <TD numeric className={cn('font-medium', tx.amount >= 0 ? 'text-success' : 'text-danger')}>
                      {tx.amount >= 0 ? '+' : '−'}
                      {money(Math.abs(tx.amount))}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        {/* Where the money went */}
        <Card>
          <CardHeader title={t('byCategory')} />
          <div className="px-5 py-4">
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)}
              </div>
            ) : byCategory.length === 0 ? (
              <p className="py-4 text-center text-sm text-fg-muted">{t('noExpenses')}</p>
            ) : (
              <ul className="space-y-3.5">
                {byCategory.map((e) => (
                  <li key={e.category}>
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="text-fg">{categoryLabel(e.category)}</span>
                      <span className="tabular-nums text-fg-muted">{money(e.amount)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-surface-muted">
                      <div
                        className="h-full rounded-full bg-fg-muted/60"
                        style={{ width: `${Math.max(2, (e.amount / maxCategory) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <ExpenseModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </PageContainer>
  );
}
