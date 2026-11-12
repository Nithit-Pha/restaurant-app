'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import { apiErrorMessage } from '@/lib/localized';
import { Link } from '@/i18n/navigation';
import type { MenuItem } from '../../../api/apiSlice';
import { Alert, Button, Dialog, IconButton, Input, LoadingBlock, Select, useToast } from '../../../components/ui';
import { useGetIngredientsQuery, useGetRecipeQuery, useSaveRecipeMutation } from './stockApi';

interface Row {
  key: number;
  ingredientId: string;
  amount: string;
}

let nextKey = 1;

/**
 * Owner: which ingredients one portion of a dish uses. Accepting an order
 * takes these amounts out of stock; a dish is sold out when one runs short.
 */
export default function RecipeDialog({ item, onDone }: { item: MenuItem; onDone: () => void }) {
  const t = useTranslations('recipe');
  const ts = useTranslations('stock');
  const tc = useTranslations('common');
  const locale = useLocale();
  const toast = useToast();
  const { data: recipe, isLoading: loadingRecipe } = useGetRecipeQuery(item.id);
  const { data: ingredients = [], isLoading: loadingIngredients } = useGetIngredientsQuery({ all: true });
  const [save, { isLoading: saving }] = useSaveRecipeMutation();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');

  // Start from the saved recipe once it has loaded.
  useEffect(() => {
    if (recipe && rows === null) {
      setRows(recipe.map((r) => ({ key: nextKey++, ingredientId: r.ingredientId, amount: String(Number(r.amount)) })));
    }
  }, [recipe, rows]);

  const byId = new Map(ingredients.map((i) => [i.id, i]));
  // Switched-off ingredients can stay in a recipe but are not offered for new lines.
  const choosable = (current: string) => ingredients.filter((i) => i.id === current || (i.isActive && !rows?.some((r) => r.ingredientId === i.id)));

  const addRow = () => {
    const free = ingredients.find((i) => i.isActive && !rows?.some((r) => r.ingredientId === i.id));
    if (free) setRows((rs) => [...(rs ?? []), { key: nextKey++, ingredientId: free.id, amount: '' }]);
  };
  const change = (key: number, patch: Partial<Row>) => setRows((rs) => rs?.map((r) => (r.key === key ? { ...r, ...patch } : r)) ?? rs);
  const remove = (key: number) => setRows((rs) => rs?.filter((r) => r.key !== key) ?? rs);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!rows) return;
    setError('');
    const items = rows.map((r) => ({ ingredientId: r.ingredientId, amount: Number(r.amount) }));
    if (items.some((i) => !(i.amount > 0) || i.amount > 100_000 || Math.round(i.amount * 1000) !== i.amount * 1000)) {
      setError(ts('amountInvalid'));
      return;
    }
    try {
      await save({ menuItemId: item.id, items }).unwrap();
      toast({ title: t('saved', { name: item.name }) });
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err, locale, ts('saveFailed')));
    }
  };

  const loading = loadingRecipe || loadingIngredients || rows === null;
  const noneLeft = !ingredients.some((i) => i.isActive && !rows?.some((r) => r.ingredientId === i.id));

  return (
    <Dialog
      open
      onClose={onDone}
      dismissOnBackdrop={false}
      title={t('title', { name: item.name })}
      description={t('description')}
      footer={
        <>
          <Button variant="ghost" onClick={onDone}>{tc('cancel')}</Button>
          <Button type="submit" form="recipe-form" loading={saving} disabled={loading}>{t('save')}</Button>
        </>
      }
    >
      {loading ? (
        <LoadingBlock label={ts('loading')} />
      ) : ingredients.length === 0 ? (
        <Alert tone="info">
          {t('noIngredients')} <Link href="/admin/stock" className="font-medium underline">{t('toStock')}</Link>
        </Alert>
      ) : (
        <form id="recipe-form" onSubmit={submit} className="space-y-3" noValidate>
          {error && <Alert tone="danger">{error}</Alert>}
          {rows!.length === 0 && <p className="text-sm text-fg-muted">{t('empty')}</p>}
          {rows!.map((r, idx) => {
            const ing = byId.get(r.ingredientId);
            return (
              <div key={r.key} className="flex items-center gap-2">
                <Select
                  aria-label={t('ingredientN', { n: idx + 1 })}
                  value={r.ingredientId}
                  onChange={(e) => change(r.key, { ingredientId: e.target.value })}
                  className="min-w-0 flex-1"
                >
                  {choosable(r.ingredientId).map((i) => (
                    <option key={i.id} value={i.id}>{i.isActive ? i.name : `${i.name} (${ts('switchedOff')})`}</option>
                  ))}
                </Select>
                <Input
                  aria-label={t('amountN', { n: idx + 1 })}
                  type="number"
                  min="0"
                  step="0.001"
                  inputMode="decimal"
                  value={r.amount}
                  onChange={(e) => change(r.key, { amount: e.target.value })}
                  placeholder="0"
                  className="!w-24 tabular-nums"
                />
                <span className="w-10 shrink-0 text-sm text-fg-muted">{ing ? ts(`unit.${ing.unit}`) : ''}</span>
                <IconButton icon={Trash2} label={t('removeN', { n: idx + 1 })} size="sm" onClick={() => remove(r.key)} className="hover:!bg-danger-soft hover:!text-danger" />
              </div>
            );
          })}
          <Button variant="secondary" size="sm" icon={Plus} onClick={addRow} disabled={noneLeft}>{t('add')}</Button>
          <p className="text-xs text-fg-muted">{t('hint')}</p>
        </form>
      )}
    </Dialog>
  );
}
