'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { apiErrorMessage } from '@/lib/localized';
import { Alert, Button, Dialog, Field, Input, Select, Switch, useToast } from '../../../components/ui';
import { UNITS, useCreateIngredientMutation, useUpdateIngredientMutation, type Ingredient, type Unit } from './stockApi';

const status = (err: unknown) => (err as { status?: number } | undefined)?.status;

/** Owner: add an ingredient, or edit one (name, unit, low-stock level, storage, on/off). */
export default function IngredientDialog({ ingredient, onDone }: { ingredient?: Ingredient; onDone: () => void }) {
  const t = useTranslations('stock');
  const tc = useTranslations('common');
  const locale = useLocale();
  const toast = useToast();
  const [create, { isLoading: creating }] = useCreateIngredientMutation();
  const [update, { isLoading: updating }] = useUpdateIngredientMutation();
  const [name, setName] = useState(ingredient?.name ?? '');
  const [unit, setUnit] = useState<Unit>(ingredient?.unit ?? 'kg');
  const [reorderLevel, setReorderLevel] = useState(ingredient ? String(Number(ingredient.reorderLevel)) : '');
  const [storage, setStorage] = useState(ingredient?.storage ?? '');
  const [openingStock, setOpeningStock] = useState('');
  const [isActive, setIsActive] = useState(ingredient?.isActive ?? true);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError(t('nameRequired')); return; }
    const level = reorderLevel.trim() === '' ? 0 : Number(reorderLevel);
    const opening = openingStock.trim() === '' ? undefined : Number(openingStock);
    if (Number.isNaN(level) || level < 0 || (opening !== undefined && (Number.isNaN(opening) || opening < 0))) {
      setError(t('amountInvalid'));
      return;
    }
    try {
      if (ingredient) {
        await update({
          id: ingredient.id,
          patch: { name: name.trim(), unit, reorderLevel: level, storage: storage.trim() || null, isActive },
        }).unwrap();
        toast({ title: t('saved', { name: name.trim() }) });
      } else {
        await create({ name: name.trim(), unit, reorderLevel: level, storage: storage.trim() || undefined, openingStock: opening }).unwrap();
        toast({ title: t('added', { name: name.trim() }) });
      }
      onDone();
    } catch (err) {
      if (status(err) === 409) {
        setError(ingredient && unit !== ingredient.unit ? t('unitLocked') : t('nameTaken', { name: name.trim() }));
      } else {
        setError(apiErrorMessage(err, locale, t('saveFailed')));
      }
    }
  };

  return (
    <Dialog
      open
      onClose={onDone}
      dismissOnBackdrop={false}
      title={ingredient ? t('editTitle', { name: ingredient.name }) : t('addTitle')}
      description={t('ingredientDescription')}
      footer={
        <>
          <Button variant="ghost" onClick={onDone}>{tc('cancel')}</Button>
          <Button type="submit" form="ingredient-form" loading={creating || updating}>{ingredient ? t('save') : t('add')}</Button>
        </>
      }
    >
      <form id="ingredient-form" onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label={t('field.name')} htmlFor="ing-name" required>
          <Input id="ing-name" data-autofocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t('field.namePlaceholder')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('field.unit')} htmlFor="ing-unit" hint={ingredient ? t('field.unitHint') : undefined}>
            <Select id="ing-unit" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
              {UNITS.map((u) => <option key={u} value={u}>{t(`unit.${u}`)}</option>)}
            </Select>
          </Field>
          <Field label={t('field.reorderLevel')} htmlFor="ing-level" hint={t('field.reorderLevelHint')}>
            <Input id="ing-level" type="number" min="0" step="0.001" inputMode="decimal" value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} placeholder="0" className="tabular-nums" />
          </Field>
        </div>
        <Field label={t('field.storage')} htmlFor="ing-storage">
          <Input id="ing-storage" value={storage} onChange={(e) => setStorage(e.target.value)} maxLength={40} placeholder={t('field.storagePlaceholder')} />
        </Field>
        {ingredient ? (
          <Switch checked={isActive} onChange={setIsActive} label={t('field.active')} />
        ) : (
          <Field label={t('field.openingStock')} htmlFor="ing-opening" hint={t('field.openingStockHint')}>
            <Input id="ing-opening" type="number" min="0" step="0.001" inputMode="decimal" value={openingStock} onChange={(e) => setOpeningStock(e.target.value)} placeholder="0" className="tabular-nums" />
          </Field>
        )}
      </form>
    </Dialog>
  );
}
