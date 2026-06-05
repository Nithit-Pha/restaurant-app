import { useState, useEffect } from 'react';
import { useGetSettingsQuery, useSetTaxRateMutation, useSetDeliveryFeeMutation, useGetStaffQuery, useCreateStaffMutation, useUpdateStaffRoleMutation } from '../../api/apiSlice';

export default function SettingsPage() {
  const { data: settings, isLoading } = useGetSettingsQuery();
  const [setTax] = useSetTaxRateMutation();
  const [setDelivery] = useSetDeliveryFeeMutation();
  const { data: staff = [] } = useGetStaffQuery();
  const [createStaff] = useCreateStaffMutation();
  const [updateRole] = useUpdateStaffRoleMutation();

  const [taxPct, setTaxPct] = useState('');
  const [baseFee, setBaseFee] = useState('');
  const [feePerKm, setFeePerKm] = useState('');
  const [freeKm, setFreeKm] = useState('');

  const [newStaff, setNewStaff] = useState({ name: '', email: '', password: '', role: 'STAFF' as 'STAFF' | 'SUPER_ADMIN' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

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
    setSaving(true);
    try {
      await createStaff(newStaff).unwrap();
      setNewStaff({ name: '', email: '', password: '', role: 'STAFF' });
      setMsg('Staff account created');
    } catch {
      setMsg('Failed to create staff');
    }
    setSaving(false);
  };

  if (isLoading) return <div className="p-8 text-center text-gray-400">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Super Admin Settings</h1>
      {msg && <p className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded">{msg}</p>}

      {/* Tax Rate */}
      <section className="bg-white border rounded-lg p-5">
        <h2 className="font-semibold text-gray-800 mb-4">Tax Rate</h2>
        <div className="flex items-center gap-3">
          <input
            type="number" min="0" max="100" step="0.1"
            value={taxPct}
            onChange={(e) => setTaxPct(e.target.value)}
            className="w-28 border rounded px-3 py-1.5 text-sm"
          />
          <span className="text-gray-600 text-sm">%</span>
          <button onClick={saveTax} disabled={saving} className="bg-brand-500 hover:bg-brand-600 text-white text-sm px-4 py-1.5 rounded disabled:opacity-50">
            Save
          </button>
        </div>
      </section>

      {/* Delivery Fee */}
      <section className="bg-white border rounded-lg p-5">
        <h2 className="font-semibold text-gray-800 mb-4">Delivery Fee Rules</h2>
        <div className="grid grid-cols-3 gap-4 mb-3">
          {[
            { label: 'Base fee ($)', value: baseFee, set: setBaseFee },
            { label: 'Per km beyond free zone ($)', value: feePerKm, set: setFeePerKm },
            { label: 'Free zone (km)', value: freeKm, set: setFreeKm },
          ].map(({ label, value, set }) => (
            <div key={label}>
              <label className="block text-xs text-gray-500 mb-1">{label}</label>
              <input
                type="number" min="0" step="0.01"
                value={value}
                onChange={(e) => set(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
          ))}
        </div>
        <button onClick={saveDelivery} disabled={saving} className="bg-brand-500 hover:bg-brand-600 text-white text-sm px-4 py-1.5 rounded disabled:opacity-50">
          Save
        </button>
      </section>

      {/* Staff Management */}
      <section className="bg-white border rounded-lg p-5">
        <h2 className="font-semibold text-gray-800 mb-4">Staff Accounts</h2>

        <form onSubmit={handleCreateStaff} className="grid grid-cols-2 gap-3 mb-5">
          {(['name', 'email', 'password'] as const).map((f) => (
            <div key={f}>
              <label className="block text-xs text-gray-500 mb-1 capitalize">{f}</label>
              <input
                type={f === 'password' ? 'password' : 'text'}
                value={newStaff[f]}
                onChange={(e) => setNewStaff({ ...newStaff, [f]: e.target.value })}
                required
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
          ))}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Role</label>
            <select
              value={newStaff.role}
              onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value as 'STAFF' | 'SUPER_ADMIN' })}
              className="w-full border rounded px-2 py-1.5 text-sm"
            >
              <option value="STAFF">Staff</option>
              <option value="SUPER_ADMIN">Super Admin</option>
            </select>
          </div>
          <div className="col-span-2">
            <button type="submit" disabled={saving} className="bg-brand-500 hover:bg-brand-600 text-white text-sm px-4 py-1.5 rounded disabled:opacity-50">
              Create Account
            </button>
          </div>
        </form>

        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">Name</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">Email</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {staff.map((s) => (
              <tr key={s.id}>
                <td className="px-3 py-2">{s.name}</td>
                <td className="px-3 py-2 text-gray-500">{s.email}</td>
                <td className="px-3 py-2">
                  <select
                    value={s.role}
                    onChange={(e) => updateRole({ id: s.id, role: e.target.value })}
                    className="border rounded px-2 py-0.5 text-xs"
                  >
                    <option value="STAFF">Staff</option>
                    <option value="SUPER_ADMIN">Super Admin</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
