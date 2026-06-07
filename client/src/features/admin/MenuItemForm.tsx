'use client';

import { useRef, useState } from 'react';
import { useCreateMenuItemMutation, useUpdateMenuItemMutation, type MenuItem } from '../../api/apiSlice';

interface Props {
  item?: MenuItem;
  onDone: () => void;
}

const CATEGORIES = ['Appetizers', 'Mains', 'Drinks', 'Desserts'];

export default function MenuItemForm({ item, onDone }: Props) {
  const [create] = useCreateMenuItemMutation();
  const [update] = useUpdateMenuItemMutation();
  const [preview, setPreview] = useState<string | null>(item?.imageUrl ?? null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: item?.name ?? '',
    description: item?.description ?? '',
    category: item?.category ?? CATEGORIES[0],
    costPrice: item?.costPrice?.toString() ?? '',
    sellingPrice: item?.sellingPrice?.toString() ?? '',
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (fileRef.current?.files?.[0]) fd.append('image', fileRef.current.files[0]);

      if (item) {
        await update({ id: item.id, data: fd }).unwrap();
      } else {
        await create(fd).unwrap();
      }
      onDone();
    } catch (_) {}
    setIsLoading(false);
  };

  const inputCls = 'w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white';

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 dark:bg-gray-700 border dark:border-gray-600 rounded-lg p-4 space-y-4">
      <h2 className="font-semibold text-gray-900 dark:text-white">{item ? 'Edit item' : 'New item'}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(['name', 'description'] as const).map((field) => (
          <div key={field}>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 capitalize">{field}</label>
            <input
              value={form[field]}
              onChange={(e) => setForm({ ...form, [field]: e.target.value })}
              className={inputCls}
            />
          </div>
        ))}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Category</label>
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className={inputCls}
          >
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Cost Price</label>
          <input
            type="number" step="0.01" min="0"
            value={form.costPrice}
            onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Selling Price</label>
          <input
            type="number" step="0.01" min="0"
            value={form.sellingPrice}
            onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Image</label>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="text-sm dark:text-gray-300" />
          {preview && <img src={preview} alt="preview" className="mt-2 h-20 rounded object-cover" />}
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onDone} className="px-4 py-1.5 text-sm border dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-gray-300">Cancel</button>
        <button type="submit" disabled={isLoading} className="px-4 py-1.5 text-sm bg-brand-500 text-white rounded hover:bg-brand-600 disabled:opacity-50">
          {isLoading ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
