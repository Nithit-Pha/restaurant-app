import { useState, useEffect } from 'react';

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.477 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
    </svg>
  );
}
import { useGetSettingsQuery, useSetTaxRateMutation, useSetDeliveryFeeMutation, useGetStaffQuery, useCreateStaffMutation, useUpdateStaffRoleMutation, useDeleteStaffMutation } from '../../api/apiSlice';

const inputCls = 'w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white';

export default function SettingsPage() {
  const { data: settings, isLoading } = useGetSettingsQuery();
  const [setTax] = useSetTaxRateMutation();
  const [setDelivery] = useSetDeliveryFeeMutation();
  const { data: staff = [] } = useGetStaffQuery();
  const [createStaff] = useCreateStaffMutation();
  const [updateRole] = useUpdateStaffRoleMutation();
  const [deleteStaff] = useDeleteStaffMutation();

  const [taxPct, setTaxPct] = useState('');
  const [baseFee, setBaseFee] = useState('');
  const [feePerKm, setFeePerKm] = useState('');
  const [freeKm, setFreeKm] = useState('');

  const [newStaff, setNewStaff] = useState({ name: '', email: '', password: '', confirmPassword: '', role: 'STAFF' as 'STAFF' | 'SUPER_ADMIN' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (settings) {
      setTaxPct(String(Math.round(settings.TAX_RATE * 100)));
      setBaseFee(String(settings.DELIVERY_BASE_FEE));
      setFeePerKm(String(settings.DELIVERY_FEE_PER_KM));
      setFreeKm(String(settings.DELIVERY_FREE_KM));
    }
  }, [settings]);

  const saveTax = async () => {
    setSaving(true);
    await setTax({ value: parseFloat(taxPct) / 100 });
    setMsg('Tax rate saved');
    setSaving(false);
  };

  const saveDelivery = async () => {
    setSaving(true);
    await setDelivery({ baseFee: parseFloat(baseFee), feePerKm: parseFloat(feePerKm), freeKm: parseFloat(freeKm) });
    setMsg('Delivery fee saved');
    setSaving(false);
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (newStaff.password !== newStaff.confirmPassword) {
      setFormError('Passwords do not match');
      return;
    }
    setSaving(true);
    try {
      const { confirmPassword: _, ...payload } = newStaff;
      await createStaff(payload).unwrap();
      setNewStaff({ name: '', email: '', password: '', confirmPassword: '', role: 'STAFF' });
      setShowPassword(false);
      setShowConfirm(false);
      setMsg('Staff account created');
    } catch {
      setFormError('Failed to create staff account');
    }
    setSaving(false);
  };

  if (isLoading) return <div className="p-8 text-center text-gray-400">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Super Admin Settings</h1>
      {msg && <p className="text-sm text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-400 px-3 py-2 rounded">{msg}</p>}

      {/* Tax Rate */}
      <section className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-5">
        <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">Tax Rate</h2>
        <div className="flex items-center gap-3">
          <input
            type="number" min="0" max="100" step="0.1"
            value={taxPct}
            onChange={(e) => setTaxPct(e.target.value)}
            className="w-28 border rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
          />
          <span className="text-gray-600 dark:text-gray-400 text-sm">%</span>
          <button onClick={saveTax} disabled={saving} className="bg-brand-500 hover:bg-brand-600 text-white text-sm px-4 py-1.5 rounded disabled:opacity-50">
            Save
          </button>
        </div>
      </section>

      {/* Delivery Fee */}
      <section className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-5">
        <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">Delivery Fee Rules</h2>
        <div className="grid grid-cols-3 gap-4 mb-3">
          {[
            { label: 'Base fee ($)', value: baseFee, set: setBaseFee },
            { label: 'Per km beyond free zone ($)', value: feePerKm, set: setFeePerKm },
            { label: 'Free zone (km)', value: freeKm, set: setFreeKm },
          ].map(({ label, value, set }) => (
            <div key={label}>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</label>
              <input
                type="number" min="0" step="0.01"
                value={value}
                onChange={(e) => set(e.target.value)}
                className={inputCls}
              />
            </div>
          ))}
        </div>
        <button onClick={saveDelivery} disabled={saving} className="bg-brand-500 hover:bg-brand-600 text-white text-sm px-4 py-1.5 rounded disabled:opacity-50">
          Save
        </button>
      </section>

      {/* Staff Management */}
      <section className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-5">
        <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">Staff Accounts</h2>

        <form onSubmit={handleCreateStaff} className="grid grid-cols-2 gap-3 mb-5">
          {(['name', 'email'] as const).map((f) => (
            <div key={f}>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1 capitalize">{f}</label>
              <input
                type={f === 'email' ? 'email' : 'text'}
                value={newStaff[f]}
                onChange={(e) => setNewStaff({ ...newStaff, [f]: e.target.value })}
                required
                className={inputCls}
              />
            </div>
          ))}

          {/* Password */}
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={newStaff.password}
                onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })}
                required
                minLength={8}
                className={`${inputCls} pr-8`}
              />
              <button type="button" onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Confirm Password</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={newStaff.confirmPassword}
                onChange={(e) => setNewStaff({ ...newStaff, confirmPassword: e.target.value })}
                required
                className={`${inputCls} pr-8 ${
                  newStaff.confirmPassword && newStaff.password !== newStaff.confirmPassword
                    ? 'border-red-400'
                    : ''
                }`}
              />
              <button type="button" onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <EyeIcon open={showConfirm} />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Role</label>
            <select
              value={newStaff.role}
              onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value as 'STAFF' | 'SUPER_ADMIN' })}
              className={inputCls}
            >
              <option value="STAFF">Staff</option>
              <option value="SUPER_ADMIN">Super Admin</option>
            </select>
          </div>

          <div className="col-span-2">
            {formError && <p className="text-red-500 text-xs mb-2">{formError}</p>}
            <button type="submit" disabled={saving} className="bg-brand-500 hover:bg-brand-600 text-white text-sm px-4 py-1.5 rounded disabled:opacity-50">
              Create Account
            </button>
          </div>
        </form>

        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400">Name</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400">Email</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400">Role</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {staff.map((s) => (
              <tr key={s.id}>
                <td className="px-3 py-2 text-gray-900 dark:text-gray-200">{s.name}</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{s.email}</td>
                <td className="px-3 py-2">
                  <select
                    value={s.role}
                    onChange={(e) => updateRole({ id: s.id, role: e.target.value })}
                    className="border dark:border-gray-600 rounded px-2 py-0.5 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="STAFF">Staff</option>
                    <option value="SUPER_ADMIN">Super Admin</option>
                  </select>
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => { if (confirm(`Delete ${s.name}?`)) deleteStaff(s.id); }}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
