import { useState } from 'react';
import { useGetAuditLogQuery } from '../../api/apiSlice';
import { formatDate } from '../../lib/format';

const ENTITY_TYPES = ['', 'USER', 'MENU_ITEM', 'ORDER', 'EXPENSE', 'SETTING'];

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  UPDATE: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  STATUS_CHANGE: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
  LOGIN: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const [entityType, setEntityType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(0);

  const { data, isLoading } = useGetAuditLogQuery({
    entityType: entityType || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Audit Log</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={entityType}
          onChange={(e) => { setEntityType(e.target.value); setPage(0); }}
          className="border dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        >
          {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t || 'All types'}</option>)}
        </select>
        <input
          type="date" value={startDate}
          onChange={(e) => { setStartDate(e.target.value); setPage(0); }}
          className="border dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
        <input
          type="date" value={endDate}
          onChange={(e) => { setEndDate(e.target.value); setPage(0); }}
          className="border dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
        {(entityType || startDate || endDate) && (
          <button
            onClick={() => { setEntityType(''); setStartDate(''); setEndDate(''); setPage(0); }}
            className="text-sm text-gray-500 hover:text-red-500 underline"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-sm text-gray-400 self-center">
          {data?.total ?? 0} entries
        </span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center text-gray-400 py-12">Loading…</div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400">Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400">Actor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400">Action</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400">Entity</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {data?.logs.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No entries found</td></tr>
              )}
              {data?.logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDate(log.createdAt)}</td>
                  <td className="px-4 py-2">
                    <p className="font-medium text-gray-800 dark:text-gray-200 text-xs">{log.actor.name}</p>
                    <p className="text-gray-400 dark:text-gray-500 text-xs">{log.actor.role}</p>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-600'}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400">
                    <span className="font-medium">{log.entityType}</span>
                    {log.entityId && <span className="text-gray-400 ml-1 font-mono">#{log.entityId.slice(0, 8)}</span>}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 max-w-xs truncate">
                    {log.metadata ? JSON.stringify(log.metadata) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 border dark:border-gray-600 rounded disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300">
            ← Prev
          </button>
          <span className="text-gray-500 dark:text-gray-400">Page {page + 1} of {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 border dark:border-gray-600 rounded disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300">
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
