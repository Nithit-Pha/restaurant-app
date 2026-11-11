'use client';

import { useEffect, useState } from 'react';
import { useGetPaymentSettingsQuery, useSetPaymentSettingsMutation } from '../../../api/apiSlice';

const inputCls = 'w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white';
const labelCls = 'block text-xs text-gray-500 dark:text-gray-400 mb-1';

/** Owner: the PromptPay account customers pay into. Empty ID = PromptPay off. */
export default function PaymentSettingsSection({ onSaved }: { onSaved: (msg: string) => void }) {
  const { data } = useGetPaymentSettingsQuery();
  const [save, { isLoading }] = useSetPaymentSettingsMutation();
  const [promptPayId, setPromptPayId] = useState('');
  const [promptPayName, setPromptPayName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (data) {
      setPromptPayId(data.promptPayId);
      setPromptPayName(data.promptPayName);
    }
  }, [data]);

  const submit = async () => {
    setError('');
    try {
      const saved = await save({ promptPayId: promptPayId.trim(), promptPayName: promptPayName.trim() }).unwrap();
      onSaved(saved.promptPayId ? 'PromptPay is on at checkout' : 'PromptPay is off; customers pay cash');
    } catch (err) {
      setError((err as { data?: { message?: string } })?.data?.message || 'Could not save the payment settings');
    }
  };

  return (
    <section className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-5">
      <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">Payments</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Cash is always offered. Add a PromptPay ID to also offer a PromptPay QR with the exact amount.
        Staff confirm each transfer in the bank app, then tap “Transfer received”.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
        <div>
          <label htmlFor="promptpay-id" className={labelCls}>PromptPay ID (mobile number or 13-digit tax ID)</label>
          <input
            id="promptpay-id"
            inputMode="numeric"
            value={promptPayId}
            onChange={(e) => setPromptPayId(e.target.value)}
            placeholder="08x xxx xxxx — leave empty to switch off"
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="promptpay-name" className={labelCls}>Account name customers will see in their bank app</label>
          <input
            id="promptpay-name"
            value={promptPayName}
            onChange={(e) => setPromptPayName(e.target.value)}
            maxLength={100}
            className={inputCls}
          />
        </div>
      </div>
      {error && <p className="text-red-500 text-xs mb-2">{error}</p>}
      <button onClick={submit} disabled={isLoading} className="bg-brand-500 hover:bg-brand-600 text-white text-sm px-4 py-1.5 rounded disabled:opacity-50">
        Save
      </button>
    </section>
  );
}
