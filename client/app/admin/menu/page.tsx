'use client';

import { useState } from 'react';
import { useGetMenuItemsQuery, useDeleteMenuItemMutation, useToggleAvailabilityMutation, type MenuItem } from '../../../src/api/apiSlice';
import MenuItemForm from '../../../src/features/admin/MenuItemForm';
import { formatCurrency } from '../../../src/lib/format';
import { useRequireRole } from '../../../src/routes/useAuthGuard';

export default function AdminMenuPage() {
  const { ready } = useRequireRole('STAFF');
  // available: false = include hidden items, so they can be switched back on.
  const { data: items = [], isLoading } = useGetMenuItemsQuery({ available: false }, { skip: !ready });
  const [deleteItem] = useDeleteMenuItemMutation();
  const [toggleAvail] = useToggleAvailabilityMutation();
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState('');

  // Cost price is only sent to Super Admins; staff don't get the cost columns.
  const showCost = items.some((i) => i.costPrice !== undefined && i.costPrice !== null);

  const handleDelete = async (item: MenuItem) => {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    try {
      const res = await deleteItem(item.id).unwrap();
      setNotice(res?.hidden
        ? `"${item.name}" has past orders, so it was hidden instead of deleted.`
        : `"${item.name}" was deleted.`);
    } catch {
      setNotice(`Could not delete "${item.name}". Please try again.`);
    }
  };

  if (!ready) return null;
  if (isLoading) return <div className="p-8 text-center text-gray-400">Loading…</div>;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Menu Management</h1>
        <button
          onClick={() => setCreating(true)}
          className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-4 py-2 rounded-lg"
        >
          + Add Item
        </button>
      </div>

      {notice && (
        <p className="mb-4 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded px-3 py-2">{notice}</p>
      )}

      {(creating || editing) && (
        <div className="mb-6">
          <MenuItemForm
            item={editing ?? undefined}
            onDone={() => { setCreating(false); setEditing(null); }}
          />
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">Name</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">Category</th>
              {showCost && <th className="px-4 py-3 text-right font-medium text-gray-700 dark:text-gray-300">Cost</th>}
              <th className="px-4 py-3 text-right font-medium text-gray-700 dark:text-gray-300">Price</th>
              {showCost && <th className="px-4 py-3 text-right font-medium text-gray-700 dark:text-gray-300">Margin</th>}
              <th className="px-4 py-3 text-center font-medium text-gray-700 dark:text-gray-300">Available</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {items.map((item) => {
              // The API sends Decimal prices as strings ("9.99"); convert before maths.
              const price = Number(item.sellingPrice);
              const cost = Number(item.costPrice);
              const margin = price > 0 ? (((price - cost) / price) * 100).toFixed(1) : '—';
              return (
                <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{item.name}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{item.category}</td>
                  {showCost && <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{formatCurrency(cost)}</td>}
                  <td className="px-4 py-3 text-right font-semibold dark:text-white">{formatCurrency(price)}</td>
                  {showCost && <td className={`px-4 py-3 text-right ${cost > price ? 'text-red-600' : 'text-green-600'}`}>{margin}%</td>}
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleAvail({ id: item.id, isAvailable: !item.isAvailable })}
                      className={`px-2 py-0.5 rounded text-xs font-semibold ${item.isAvailable ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}
                    >
                      {item.isAvailable ? 'Yes' : 'No'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button onClick={() => setEditing(item)} className="text-brand-600 hover:underline text-xs">Edit</button>
                    <button onClick={() => handleDelete(item)} className="text-red-500 hover:underline text-xs">Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
