'use client';

import { useEffect, useState } from 'react';
import { useGetOpenStatusQuery, useSetBusyModeMutation, type OrderingMode } from '../../../api/apiSlice';

const EXTRA_PRESETS = [10, 15, 20, 30, 45, 60];
const MODES: { mode: OrderingMode; label: string }[] = [
  { mode: 'NORMAL', label: 'Normal' },
  { mode: 'BUSY', label: 'Busy' },
  { mode: 'PAUSED', label: 'Paused' },
];

/**
 * Staff control for a rush: Busy tells customers orders take longer,
 * Paused stops new online orders until switched back.
 */
export default function BusyModeControl() {
  const { data } = useGetOpenStatusQuery(undefined, { pollingInterval: 30_000 });
  const [setBusyMode, { isLoading }] = useSetBusyModeMutation();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (data) setMessage(data.pauseMessage);
  }, [data?.pauseMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return null;
  const extra = data.busyExtraMinutes > 0 ? data.busyExtraMinutes : 15;

  const change = async (mode: OrderingMode, extraMinutes?: number, pauseMessage?: string) => {
    setError('');
    try {
      await setBusyMode({ mode, ...(mode === 'BUSY' ? { extraMinutes: extraMinutes ?? extra } : {}), ...(pauseMessage !== undefined ? { pauseMessage } : {}) }).unwrap();
    } catch (err) {
      setError((err as { data?: { message?: string } })?.data?.message || 'Could not change online ordering');
    }
  };

  const tone: Record<OrderingMode, string> = {
    NORMAL: 'bg-green-600 border-green-600 text-white',
    BUSY: 'bg-amber-500 border-amber-500 text-white',
    PAUSED: 'bg-red-600 border-red-600 text-white',
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-gray-600 dark:text-gray-400">Online orders:</span>
      <div role="group" aria-label="Online ordering" className="inline-flex rounded-lg overflow-hidden border dark:border-gray-600">
        {MODES.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            aria-pressed={data.mode === mode}
            disabled={isLoading}
            onClick={() => { if (data.mode !== mode) void change(mode); }}
            className={`px-3 min-h-[36px] text-xs font-semibold border-l first:border-l-0 dark:border-gray-600 disabled:opacity-60 ${
              data.mode === mode ? tone[mode] : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {data.mode === 'BUSY' && (
        <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
          +
          <select
            value={data.busyExtraMinutes}
            onChange={(e) => void change('BUSY', Number(e.target.value))}
            disabled={isLoading}
            aria-label="Extra minutes while busy"
            className="border dark:border-gray-600 rounded px-1.5 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            {Array.from(new Set([...EXTRA_PRESETS, data.busyExtraMinutes])).sort((a, b) => a - b).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          min
        </label>
      )}

      {data.mode === 'PAUSED' && (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => { e.preventDefault(); void change('PAUSED', undefined, message.trim()); }}
        >
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={200}
            aria-label="Message for customers while paused"
            className="w-64 max-w-full border dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
          <button type="submit" disabled={isLoading || message.trim() === data.pauseMessage} className="text-xs text-brand-600 hover:underline disabled:opacity-40">
            Save message
          </button>
        </form>
      )}

      {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
