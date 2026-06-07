'use client';

import { useMemo, useState } from 'react';
import { useGetDashboardQuery } from '../../../src/features/admin/finance/financeApi';
import ExpenseModal from '../../../src/features/admin/finance/ExpenseModal';
import { useRequireRole } from '../../../src/routes/useAuthGuard';

// ---- date helpers ------------------------------------------------------
const iso = (d: Date) => d.toISOString().slice(0, 10);

function presetRange(preset: string): { startDate?: string; endDate?: string } {
  const now = new Date();
  switch (preset) {
    case 'this_month':
      return {
        startDate: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
        endDate: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      };
    case 'last_month':
      return {
        startDate: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        endDate: iso(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case 'last_30':
      return {
        startDate: iso(new Date(now.getTime() - 29 * 864e5)),
        endDate: iso(now),
      };
    case 'ytd':
      return {
        startDate: iso(new Date(now.getFullYear(), 0, 1)),
        endDate: iso(now),
      };
    default:
      return {};
  }
}

const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

// ---- KPI card ----------------------------------------------------------
function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: 'green' | 'red' | 'indigo' | 'amber';
}) {
  const colors: Record<string, string> = {
    green: 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-400',
    red: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
    amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  };
  return (
    <div className={`rounded-2xl border p-5 ${colors[accent]}`}>
      <p className="text-sm font-medium opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-1 text-xs opacity-70">{sub}</p>}
    </div>
  );
}

export default function FinancialDashboard() {
  const { ready } = useRequireRole('SUPER_ADMIN');
  const [preset, setPreset] = useState('this_month');
  const [custom, setCustom] = useState<{ startDate: string; endDate: string }>({
    startDate: iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
    endDate: iso(new Date()),
  });
  const [modalOpen, setModalOpen] = useState(false);

  const range = useMemo(
    () => (preset === 'custom' ? custom : presetRange(preset)),
    [preset, custom],
  );

  const { data, isLoading, isFetching, isError, refetch } = useGetDashboardQuery(range, { skip: !ready });

  const k = data?.kpis;

  if (!ready) return null;

  return (
    <div className="mx-auto max-w-6xl p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Financial Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Revenue, costs, and profit — Super Admin only</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + Add Expense
        </button>
      </div>

      {/* Date filter */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {[
          ['this_month', 'This Month'],
          ['last_month', 'Last Month'],
          ['last_30', 'Last 30 Days'],
          ['ytd', 'Year to Date'],
          ['custom', 'Custom'],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setPreset(value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              preset === value
                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {label}
          </button>
        ))}
        {preset === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={custom.startDate}
              max={custom.endDate}
              onChange={(e) => setCustom((c) => ({ ...c, startDate: e.target.value }))}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-1.5 text-sm"
            />
            <span className="text-gray-400">to</span>
            <input
              type="date"
              value={custom.endDate}
              min={custom.startDate}
              max={iso(new Date())}
              onChange={(e) => setCustom((c) => ({ ...c, endDate: e.target.value }))}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-1.5 text-sm"
            />
          </div>
        )}
        {isFetching && <span className="text-sm text-gray-400">Refreshing…</span>}
      </div>

      {/* States */}
      {isError && (
        <div className="mb-6 flex items-center justify-between rounded-lg bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <span>Could not load financial data.</span>
          <button onClick={() => refetch()} className="font-medium underline">Retry</button>
        </div>
      )}

      {/* KPI cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading || !k ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-700" />
          ))
        ) : (
          <>
            <KpiCard label="Total Revenue" value={money(k.totalRevenue)} sub={`${k.orderCount} orders`} accent="indigo" />
            <KpiCard label="COGS (Food Cost)" value={money(k.totalCOGS)} sub={`Gross margin ${k.grossMarginPct}%`} accent="amber" />
            <KpiCard label="Operating Expenses" value={money(k.totalOperatingExpenses)} sub={`${k.expenseCount} expenses`} accent="red" />
            <KpiCard label="Net Profit" value={money(k.netProfit)} sub={`Gross profit ${money(k.grossProfit)}`} accent={k.netProfit >= 0 ? 'green' : 'red'} />
          </>
        )}
      </div>

      {/* Transaction history */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700">
        <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Transaction History</h2>
        </div>
        <div className="overflow-x-auto bg-white dark:bg-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Detail</th>
                <th className="px-5 py-3 font-medium">Category</th>
                <th className="px-5 py-3 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && data?.transactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-gray-400">No transactions in this period.</td>
                </tr>
              )}
              {data?.transactions.map((t) => (
                <tr
                  key={`${t.kind}-${t.id}`}
                  className="border-b border-gray-100 dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{fmtDate(t.date)}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      t.kind === 'ORDER'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                    }`}>
                      {t.kind === 'ORDER' ? 'Revenue' : 'Expense'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-800 dark:text-gray-200">{t.label}</td>
                  <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{t.category.replace('_', ' ')}</td>
                  <td className={`px-5 py-3 text-right font-medium ${t.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {t.amount >= 0 ? '+' : '−'}
                    {money(Math.abs(t.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ExpenseModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
