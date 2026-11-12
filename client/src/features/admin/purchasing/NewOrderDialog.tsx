'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiErrorMessage } from '@/lib/localized';
import { Alert, Button, Dialog, Field, Select } from '../../../components/ui';
import type { Ingredient } from '../stock/stockApi';
import { useGetSuppliersQuery } from '../suppliers/suppliersApi';
import { useCreatePurchaseOrderMutation } from './purchasingApi';

/** Owner: pick a supplier; the new draft starts with its low ingredients ticked. */
export default function NewOrderDialog({ ingredients, onDone }: { ingredients: Ingredient[]; onDone: () => void }) {
  const t = useTranslations('purchasing');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const { data: suppliers = [], isLoading } = useGetSuppliersQuery();
  const [create, { isLoading: creating }] = useCreatePurchaseOrderMutation();
  const lowFor = (id: string) => ingredients.filter((i) => i.supplierId === id && i.low).length;
  const [supplierId, setSupplierId] = useState('');
  const [error, setError] = useState('');
  const chosen = supplierId || (suppliers.length ? [...suppliers].sort((a, b) => lowFor(b.id) - lowFor(a.id))[0].id : '');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!chosen) return;
    try {
      const po = await create({ supplierId: chosen }).unwrap();
      onDone();
      router.push(`/admin/purchase-orders/${po.id}`);
    } catch (err) {
      setError(apiErrorMessage(err, locale, t('createFailed')));
    }
  };

  return (
    <Dialog
      open
      onClose={onDone}
      title={t('newTitle')}
      description={t('newDescription')}
      footer={
        <>
          <Button variant="ghost" onClick={onDone}>{tc('cancel')}</Button>
          <Button type="submit" form="new-po-form" loading={creating} disabled={!chosen}>{t('create')}</Button>
        </>
      }
    >
      <form id="new-po-form" onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        {!isLoading && suppliers.length === 0 ? (
          <Alert tone="info">{t('noSuppliers')}</Alert>
        ) : (
          <Field label={t('supplier')} htmlFor="po-supplier">
            <Select id="po-supplier" data-autofocus value={chosen} onChange={(e) => setSupplierId(e.target.value)}>
              {suppliers.map((s) => {
                const low = lowFor(s.id);
                return <option key={s.id} value={s.id}>{low ? `${s.name} — ${t('lowCount', { count: low })}` : s.name}</option>;
              })}
            </Select>
          </Field>
        )}
      </form>
    </Dialog>
  );
}
