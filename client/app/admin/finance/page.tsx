'use client';

import { useMemo, useState } from 'react';
import { Plus, ReceiptText, RotateCw } from 'lucide-react';
import { useGetDashboardQuery } from '../../../src/features/admin/finance/financeApi';
import ExpenseModal, { EXPENSE_CATEGORY_LABELS } from '../../../src/features/admin/finance/ExpenseModal';
import { useRequireRole } from '../../../src/routes/useAuthGuard';
import { bangkokDateISO, formatCurrency, TIME_ZONE } from '../../../src/lib/format';
import {
  Alert, Badge, Button, Card, CardHeader, ChipGroup, EmptyState, Input, PageContainer, PageHeader, Skeleton, Stat,
  Table, TBody, TD, TH, THead, TR, cn,
} from '../../../src/components/ui';

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

const PRESETS = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_30', label: 'Last 30 days' },
  { value: 'ytd', label: 'Year to date' },
  { value: 'custom', label: 'Custom' },
];

const money = formatCurrency;

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: TIME_ZONE,
  });

const categoryLabel = (c: string) => EXPENSE_CATEGORY_LABELS[c] ?? c.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (x) => x.toUpperCase());

export default function FinancialDashboard() {
  const { ready } = useRequireRole('SUPER_ADMIN');
  const [preset, setPreset] = useState('this_month');
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

  const rangeText = range.startDate && range.endDate ? `${fmtDate(range.startDate)} – ${fmtDate(range.endDate)}` : 'All time';

  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Business"
        title="Finance"
        description={
          <span className="tabular-nums">
            Revenue, costs and profit · {rangeText}
            {isFetching && !isLoading ? ' · refreshing…' : ''}
          </span>
        }
        actions={<Button icon={Plus} onClick={() => setModalOpen(true)}>Add expense</Button>}
      />

      {/* Period */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <ChipGroup label="Period" value={preset} onChange={setPreset} options={PRESETS} />
        {preset === 'custom' && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              aria-label="From"
              value={custom.startDate}
              max={custom.endDate}
              onChange={(e) => setCustom((c) => ({ ...c, startDate: e.target.value }))}
              className="!h-9 !w-auto"
            />
            <span className="text-sm text-fg-muted">to</span>
            <Input
              type="date"
              aria-label="To"
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
          action={<Button variant="secondary" size="sm" icon={RotateCw} onClick={() => refetch()}>Retry</Button>}
        >
          Could not load financial data.
        </Alert>
      )}

      {/* Summary figures */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading || !k ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[6.5rem] rounded-card" />)
        ) : (
          <>
            <Stat label="Revenue" value={money(k.totalRevenue)} note={`${k.orderCount} completed, paid orders`} />
            <Stat label="Food cost (COGS)" value={money(k.totalCOGS)} note={`Gross margin ${k.grossMarginPct}%`} />
            <Stat label="Operating expenses" value={money(k.totalOperatingExpenses)} note={`${k.expenseCount} expenses`} />
            <Stat
              label="Net profit"
              value={<span className={k.netProfit >= 0 ? 'text-success' : 'text-danger'}>{money(k.netProfit)}</span>}
              note={`Gross profit ${money(k.grossProfit)}`}
              className={cn(k.netProfit < 0 && 'border-danger/40')}
            />
          </>
        )}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Transactions */}
        <Card className="overflow-hidden">
          <CardHeader title="Transactions" description="Paid orders and expenses in this period." />
          {!isLoading && data?.transactions.length === 0 ? (
            <EmptyState icon={ReceiptText} title="No transactions in this period." />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Type</TH>
                  <TH>Detail</TH>
                  <TH className="hidden md:table-cell">Category</TH>
                  <TH numeric>Amount</TH>
                </tr>
              </THead>
              <TBody>
                {data?.transactions.map((t) => (
                  <TR key={`${t.kind}-${t.id}`} className="hover:bg-surface-hover">
                    <TD muted className="whitespace-nowrap tabular-nums">{fmtDate(t.date)}</TD>
                    <TD>
                      <Badge tone={t.kind === 'ORDER' ? 'success' : 'danger'}>{t.kind === 'ORDER' ? 'Revenue' : 'Expense'}</Badge>
                    </TD>
                    <TD className="max-w-xs truncate">{t.label}</TD>
                    <TD muted className="hidden md:table-cell">{categoryLabel(t.category)}</TD>
                    <TD numeric className={cn('font-medium', t.amount >= 0 ? 'text-success' : 'text-danger')}>
                      {t.amount >= 0 ? '+' : '−'}
                      {money(Math.abs(t.amount))}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        {/* Where the money went */}
        <Card>
          <CardHeader title="Expenses by category" />
          <div className="px-5 py-4">
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)}
              </div>
            ) : byCategory.length === 0 ? (
              <p className="py-4 text-center text-sm text-fg-muted">No expenses in this period.</p>
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
