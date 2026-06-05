import { useState } from 'react';
import { useGetMenuItemsQuery, useDeleteMenuItemMutation, useToggleAvailabilityMutation, type MenuItem } from '../../api/apiSlice';
import MenuItemForm from './MenuItemForm';
import { formatCurrency } from '../../lib/format';

export default function AdminMenuPage() {
  const { data: items = [], isLoading } = useGetMenuItemsQuery({ available: undefined as any });
  const [deleteItem] = useDeleteMenuItemMutation();
  const [toggleAvail] = useToggleAvailabilityMutation();
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [creating, setCreating] = useState(false);

  if (isLoading) return <div className="p-8 text-center text-gray-400">Loading…</div>;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Menu Management</h1>
        <button
          onClick={() => setCreating(true)}
          className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-4 py-2 rounded-lg"
        >
          + Add Item
        </button>
      </div>

      {(creating || editing) && (
        <div className="mb-6">
          <MenuItemForm
            item={editing ?? undefined}
            onDone={() => { setCreating(false); setEditing(null); }}
          />
        </div>
      )}

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Name</th>
              <th className="px-4 py-3 text-left font-medium text-gray-700">Category</th>
              <th className="px-4 py-3 text-right font-medium text-gray-700">Cost</th>
              <th className="px-4 py-3 text-right font-medium text-gray-700">Price</th>
              <th className="px-4 py-3 text-right font-medium text-gray-700">Margin</th>
              <th className="px-4 py-3 text-center font-medium text-gray-700">Available</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item) => {
              const margin = ((item.sellingPrice - item.costPrice) / item.sellingPrice * 100).toFixed(1);
              return (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                  <td className="px-4 py-3 text-gray-600">{item.category}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(item.costPrice)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatCurrency(item.sellingPrice)}</td>
                  <td className="px-4 py-3 text-right text-green-600">{margin}%</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleAvail({ id: item.id, isAvailable: !item.isAvailable })}
                      className={`px-2 py-0.5 rounded text-xs font-semibold ${item.isAvailable ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                    >
                      {item.isAvailable ? 'Yes' : 'No'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button onClick={() => setEditing(item)} className="text-brand-600 hover:underline text-xs">Edit</button>
                    <button onClick={() => deleteItem(item.id)} className="text-red-500 hover:underline text-xs">Delete</button>
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
