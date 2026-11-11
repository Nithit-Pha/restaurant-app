'use client';

import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { apiErrorMessage } from '@/lib/localized';
import { ImagePlus, UtensilsCrossed } from 'lucide-react';
import { useCreateMenuItemMutation, useGetMeQuery, useUpdateMenuItemMutation, type MenuItem } from '../../api/apiSlice';
import { Alert, Button, Dialog, Field, Input, Select, Textarea, useToast } from '../../components/ui';

interface Props {
  item?: MenuItem;
  onDone: () => void;
}

const CATEGORIES = ['Appetizers', 'Mains', 'Drinks', 'Desserts'];

/** Add or edit a menu item, in a dialog. */
export default function MenuItemForm({ item, onDone }: Props) {
  const t = useTranslations('menuForm');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [create] = useCreateMenuItemMutation();
  const [update] = useUpdateMenuItemMutation();
  const toast = useToast();
  // Cost price is the owner's business: staff never see or send it.
  const { data: me } = useGetMeQuery();
  const isOwner = me?.role === 'SUPER_ADMIN';
  const [preview, setPreview] = useState<string | null>(item?.imageUrl ?? null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: item?.name ?? '',
    description: item?.description ?? '',
    // Optional Thai text; sent empty to clear it (the Thai site then shows English).
    nameTh: item?.nameTh ?? '',
    descriptionTh: item?.descriptionTh ?? '',
    category: item?.category ?? CATEGORIES[0],
    costPrice: item?.costPrice?.toString() ?? '',
    sellingPrice: item?.sellingPrice?.toString() ?? '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  // Keep an existing item's category selectable even if it is not in the list.
  const categories = CATEGORIES.includes(form.category) ? CATEGORIES : [form.category, ...CATEGORIES];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (k === 'costPrice' && (!isOwner || v === '')) return;
        // A new item without Thai text leaves the fields out altogether.
        if ((k === 'nameTh' || k === 'descriptionTh') && !item && v.trim() === '') return;
        fd.append(k, v);
      });
      if (fileRef.current?.files?.[0]) fd.append('image', fileRef.current.files[0]);

      if (item) {
        await update({ id: item.id, data: fd }).unwrap();
      } else {
        await create(fd).unwrap();
      }
      toast({ title: item ? t('saved', { name: form.name }) : t('added', { name: form.name }) });
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err, locale, t('saveFailed')));
    }
    setIsLoading(false);
  };

  return (
    <Dialog
      open
      onClose={onDone}
      size="lg"
      dismissOnBackdrop={false}
      title={item ? t('editTitle', { name: item.name }) : t('newTitle')}
      description={t('description')}
      footer={
        <>
          <Button variant="ghost" onClick={onDone}>{tc('cancel')}</Button>
          <Button type="submit" form="menu-item-form" loading={isLoading}>
            {tc('save')}
          </Button>
        </>
      }
    >
      <form id="menu-item-form" onSubmit={handleSubmit} className="grid gap-5 sm:grid-cols-[1fr_11rem]">
        <div className="space-y-4">
          <Field label={t('name')} htmlFor="mi-name" required>
            <Input id="mi-name" data-autofocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <Field label={t('descriptionField')} htmlFor="mi-desc" hint={t('descriptionHint')}>
            <Textarea
              id="mi-desc"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              aria-describedby="mi-desc-hint"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('nameTh')} htmlFor="mi-name-th" hint={t('thaiHint')}>
              <Input
                id="mi-name-th"
                lang="th"
                value={form.nameTh}
                maxLength={200}
                onChange={(e) => setForm({ ...form, nameTh: e.target.value })}
                aria-describedby="mi-name-th-hint"
              />
            </Field>
            <Field label={t('descriptionTh')} htmlFor="mi-desc-th">
              <Textarea
                id="mi-desc-th"
                lang="th"
                rows={2}
                value={form.descriptionTh}
                maxLength={1000}
                onChange={(e) => setForm({ ...form, descriptionTh: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('category')} htmlFor="mi-cat">
              <Select id="mi-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {categories.map((c) => <option key={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label={t('sellingPrice')} htmlFor="mi-price" required>
              <Input
                id="mi-price"
                type="number" step="0.01" min="0"
                inputMode="decimal"
                className="tabular-nums"
                value={form.sellingPrice}
                onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
                required
              />
            </Field>
            {isOwner && (
              <Field label={t('costPrice')} htmlFor="mi-cost" hint={t('costHint')}>
                <Input
                  id="mi-cost"
                  type="number" step="0.01" min="0"
                  inputMode="decimal"
                  className="tabular-nums"
                  value={form.costPrice}
                  onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
                  aria-describedby="mi-cost-hint"
                />
              </Field>
            )}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-fg">{t('photo')}</p>
          <label className="group block cursor-pointer">
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-card border border-dashed border-line-strong bg-surface-muted text-fg-subtle transition-colors group-hover:border-accent">
              {preview ? (
                <img src={preview} alt="" className="h-full w-full object-cover" />
              ) : (
                <UtensilsCrossed size={28} strokeWidth={1.5} aria-hidden />
              )}
            </div>
            <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-accent">
              <ImagePlus size={16} strokeWidth={1.75} aria-hidden />
              {preview ? t('changePhoto') : t('addPhoto')}
            </span>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="sr-only" />
          </label>
        </div>

        {error && <Alert tone="danger" className="sm:col-span-2">{error}</Alert>}
      </form>
    </Dialog>
  );
}
