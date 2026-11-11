'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { apiErrorMessage } from '@/lib/localized';
import { useGetOpenStatusQuery, useSetBusyModeMutation, type OrderingMode } from '../../../api/apiSlice';

const EXTRA_PRESETS = [10, 15, 20, 30, 45, 60];
const MODES: OrderingMode[] = ['NORMAL', 'BUSY', 'PAUSED'];

/**
 * Staff control for a rush: Busy tells customers orders take longer,
 * Paused stops new online orders until switched back.
 */
export default function BusyModeControl() {
  const t = useTranslations('busyMode');
  const locale = useLocale();
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
      setError(apiErrorMessage(err, locale, t('changeFailed')));
    }
  };

  const tone: Record<OrderingMode, string> = {
    NORMAL: 'bg-green-600 border-green-600 text-white',
    BUSY: 'bg-amber-500 border-amber-500 text-white',
    PAUSED: 'bg-red-600 border-red-600 text-white',
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-gray-600 dark:text-gray-400">{t('label')}</span>
      <div role="group" aria-label={t('groupLabel')} className="inline-flex rounded-lg overflow-hidden border dark:border-gray-600">
        {MODES.map((mode) => (
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
            {t(`mode.${mode}`)}
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
            aria-label={t('extraMinutes')}
            className="border dark:border-gray-600 rounded px-1.5 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            {Array.from(new Set([...EXTRA_PRESETS, data.busyExtraMinutes])).sort((a, b) => a - b).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          {t('min')}
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
            aria-label={t('pauseMessage')}
            className="w-64 max-w-full border dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
          <button type="submit" disabled={isLoading || message.trim() === data.pauseMessage} className="text-xs text-brand-600 hover:underline disabled:opacity-40">
            {t('saveMessage')}
          </button>
        </form>
      )}

      {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
