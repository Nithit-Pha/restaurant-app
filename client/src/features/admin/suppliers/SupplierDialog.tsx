'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { apiErrorMessage } from '@/lib/localized';
import { bangkokDateISO } from '@/lib/format';
import {
  Alert, Button, Dialog, Field, Input, SegmentedControl, Select, Switch, Textarea, checkboxClasses, cn, useToast,
} from '../../../components/ui';
import type { Ingredient } from '../stock/stockApi';
import { weekdayName } from './orderDays';
import {
  FREQUENCIES, useCreateSupplierMutation, useSetSupplierIngredientsMutation, useUpdateSupplierMutation,
  type OrderFrequency, type Supplier, type SupplierInput,
} from './suppliersApi';

const status = (err: unknown) => (err as { status?: number } | undefined)?.status;
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

/**
 * Owner: add or edit a supplier — contact, order days, when the draft order is
 * made, and the tick list of ingredients it delivers.
 */
export default function SupplierDialog({ supplier, ingredients, onDone }: { supplier?: Supplier; ingredients: Ingredient[]; onDone: () => void }) {
  const t = useTranslations('suppliers');
  const tc = useTranslations('common');
  const locale = useLocale();
  const toast = useToast();
  const [create, { isLoading: creating }] = useCreateSupplierMutation();
  const [update, { isLoading: updating }] = useUpdateSupplierMutation();
  const [setIngredients, { isLoading: ticking }] = useSetSupplierIngredientsMutation();

  const [name, setName] = useState(supplier?.name ?? '');
  const [contactName, setContactName] = useState(supplier?.contactName ?? '');
  const [phone, setPhone] = useState(supplier?.phone ?? '');
  const [lineId, setLineId] = useState(supplier?.lineId ?? '');
  const [email, setEmail] = useState(supplier?.email ?? '');
  const [address, setAddress] = useState(supplier?.address ?? '');
  const [note, setNote] = useState(supplier?.note ?? '');
  const [frequency, setFrequency] = useState<OrderFrequency>(supplier?.frequency ?? 'WEEKLY');
  const [weekdays, setWeekdays] = useState<number[]>(supplier?.weekdays ?? [1]);
  const [everyNDays, setEveryNDays] = useState(String(supplier?.everyNDays ?? 3));
  const [startDate, setStartDate] = useState(supplier?.startDate ?? bangkokDateISO());
  const [monthDay, setMonthDay] = useState(String(supplier?.monthDay ?? 1));
  const [draftMode, setDraftMode] = useState<'close' | 'time'>(supplier?.draftTime ? 'time' : 'close');
  const [draftTime, setDraftTime] = useState(supplier?.draftTime ?? '16:00');
  const [cutOffTime, setCutOffTime] = useState(supplier?.cutOffTime ?? '');
  const [leadTimeDays, setLeadTimeDays] = useState(String(supplier?.leadTimeDays ?? 1));
  const [minOrder, setMinOrder] = useState(supplier?.minOrder ? String(Number(supplier.minOrder)) : '');
  const [isActive, setIsActive] = useState(supplier?.isActive ?? true);
  const [initialTicked] = useState(() => new Set(ingredients.filter((i) => i.supplierId && i.supplierId === supplier?.id).map((i) => i.id)));
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(initialTicked));
  const [ingredientQuery, setIngredientQuery] = useState('');
  const [error, setError] = useState('');

  const shownIngredients = useMemo(() => {
    const q = ingredientQuery.trim().toLowerCase();
    return ingredients.filter((i) => i.isActive && (!q || i.name.toLowerCase().includes(q)));
  }, [ingredients, ingredientQuery]);

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError(t('nameRequired')); return; }
    const n = Number(everyNDays);
    const md = Number(monthDay);
    const lead = Number(leadTimeDays);
    const min = minOrder.trim() === '' ? null : Number(minOrder);
    if (frequency === 'WEEKLY' && weekdays.length === 0) { setError(t('pickWeekday')); return; }
    if (frequency === 'EVERY_N_DAYS' && (!Number.isInteger(n) || n < 2 || n > 60 || !startDate)) { setError(t('everyNInvalid')); return; }
    if (frequency === 'MONTHLY' && (!Number.isInteger(md) || md < 1 || md > 31)) { setError(t('monthDayInvalid')); return; }
    if (!Number.isInteger(lead) || lead < 0 || lead > 30 || (min !== null && (Number.isNaN(min) || min < 0))) { setError(t('numberInvalid')); return; }

    const body: SupplierInput = {
      name: name.trim(),
      contactName: contactName.trim() || null,
      phone: phone.trim() || null,
      lineId: lineId.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      note: note.trim() || null,
      frequency,
      weekdays: frequency === 'WEEKLY' ? weekdays : [],
      everyNDays: frequency === 'EVERY_N_DAYS' ? n : null,
      startDate: frequency === 'EVERY_N_DAYS' ? startDate : null,
      monthDay: frequency === 'MONTHLY' ? md : null,
      draftTime: draftMode === 'time' ? draftTime : null,
      cutOffTime: cutOffTime || null,
      leadTimeDays: lead,
      minOrder: min,
    };
    try {
      const saved = supplier
        ? await update({ id: supplier.id, patch: { ...body, isActive } }).unwrap()
        : await create(body).unwrap();
      const tickChanged = ticked.size !== initialTicked.size || [...ticked].some((id) => !initialTicked.has(id));
      if (tickChanged) await setIngredients({ id: saved.id, ingredientIds: [...ticked] }).unwrap();
      toast({ title: supplier ? t('saved', { name: body.name }) : t('added', { name: body.name }) });
      onDone();
    } catch (err) {
      setError(status(err) === 409 ? t('nameTaken', { name: body.name }) : apiErrorMessage(err, locale, t('saveFailed')));
    }
  };

  return (
    <Dialog
      open
      onClose={onDone}
      dismissOnBackdrop={false}
      size="lg"
      title={supplier ? t('editTitle', { name: supplier.name }) : t('addTitle')}
      description={t('dialogDescription')}
      footer={
        <>
          <Button variant="ghost" onClick={onDone}>{tc('cancel')}</Button>
          <Button type="submit" form="supplier-form" loading={creating || updating || ticking}>{supplier ? t('save') : t('add')}</Button>
        </>
      }
    >
      <form id="supplier-form" onSubmit={submit} className="space-y-5" noValidate>
        {error && <Alert tone="danger">{error}</Alert>}

        <Field label={t('field.name')} htmlFor="sup-name" required>
          <Input id="sup-name" data-autofocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t('field.namePlaceholder')} />
        </Field>

        <fieldset className="space-y-4 rounded-card border border-line p-4">
          <legend className="px-1 text-sm font-semibold text-fg">{t('contactTitle')}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('field.contactName')} htmlFor="sup-contact">
              <Input id="sup-contact" value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={80} />
            </Field>
            <Field label={t('field.phone')} htmlFor="sup-phone">
              <Input id="sup-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} />
            </Field>
            <Field label={t('field.lineId')} htmlFor="sup-line">
              <Input id="sup-line" value={lineId} onChange={(e) => setLineId(e.target.value)} maxLength={60} />
            </Field>
            <Field label={t('field.email')} htmlFor="sup-email">
              <Input id="sup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} />
            </Field>
          </div>
          <Field label={t('field.address')} htmlFor="sup-address">
            <Textarea id="sup-address" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} />
          </Field>
          <Field label={t('field.note')} htmlFor="sup-note">
            <Input id="sup-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={t('field.notePlaceholder')} />
          </Field>
        </fieldset>

        <fieldset className="space-y-4 rounded-card border border-line p-4">
          <legend className="px-1 text-sm font-semibold text-fg">{t('orderDaysTitle')}</legend>
          <Field label={t('field.frequency')} htmlFor="sup-frequency">
            <Select id="sup-frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as OrderFrequency)}>
              {FREQUENCIES.map((f) => <option key={f} value={f}>{t(`frequency.${f}`)}</option>)}
            </Select>
          </Field>
          {frequency === 'WEEKLY' && (
            <div role="group" aria-label={t('field.weekdays')} className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => {
                const on = weekdays.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    aria-label={weekdayName(d, locale, 'long')}
                    onClick={() => setWeekdays((w) => (on ? w.filter((x) => x !== d) : [...w, d].sort()))}
                    className={cn(
                      'h-9 min-w-[3rem] rounded-full border px-3 text-sm font-medium transition-colors duration-150',
                      on ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface text-fg-muted hover:bg-surface-muted',
                    )}
                  >
                    {weekdayName(d, locale)}
                  </button>
                );
              })}
            </div>
          )}
          {frequency === 'EVERY_N_DAYS' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('field.everyNDays')} htmlFor="sup-every">
                <Input id="sup-every" type="number" min="2" max="60" step="1" inputMode="numeric" value={everyNDays} onChange={(e) => setEveryNDays(e.target.value)} className="tabular-nums" />
              </Field>
              <Field label={t('field.startDate')} htmlFor="sup-start" hint={t('field.startDateHint')}>
                <Input id="sup-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </Field>
            </div>
          )}
          {frequency === 'MONTHLY' && (
            <Field label={t('field.monthDay')} htmlFor="sup-monthday" hint={t('field.monthDayHint')}>
              <Input id="sup-monthday" type="number" min="1" max="31" step="1" inputMode="numeric" value={monthDay} onChange={(e) => setMonthDay(e.target.value)} className="w-32 tabular-nums" />
            </Field>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium text-fg">{t('field.draftTime')}</p>
            <SegmentedControl
              label={t('field.draftTime')}
              value={draftMode}
              onChange={setDraftMode}
              options={[{ value: 'close', label: t('draftAtClose') }, { value: 'time', label: t('draftAtTime') }]}
            />
            {draftMode === 'time' && (
              <Input type="time" aria-label={t('field.draftTimeAt')} value={draftTime} onChange={(e) => setDraftTime(e.target.value)} className="w-36" />
            )}
            <p className="text-xs text-fg-muted">{draftMode === 'close' ? t('draftAtCloseHint') : t('draftAtTimeHint')}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('field.cutOffTime')} htmlFor="sup-cutoff" hint={t('field.cutOffTimeHint')}>
              <Input id="sup-cutoff" type="time" value={cutOffTime} onChange={(e) => setCutOffTime(e.target.value)} />
            </Field>
            <Field label={t('field.leadTimeDays')} htmlFor="sup-lead" hint={t('field.leadTimeDaysHint')}>
              <Input id="sup-lead" type="number" min="0" max="30" step="1" inputMode="numeric" value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value)} className="tabular-nums" />
            </Field>
            <Field label={t('field.minOrder')} htmlFor="sup-min" hint={t('field.minOrderHint')}>
              <Input id="sup-min" type="number" min="0" step="1" inputMode="decimal" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} placeholder="—" className="tabular-nums" />
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-3 rounded-card border border-line p-4">
          <legend className="px-1 text-sm font-semibold text-fg">{t('ingredientsTitle', { count: ticked.size })}</legend>
          <p className="text-xs text-fg-muted">{t('ingredientsHint')}</p>
          {ingredients.length === 0 ? (
            <p className="text-sm text-fg-muted">{t('noIngredients')}</p>
          ) : (
            <>
              <Input type="search" value={ingredientQuery} onChange={(e) => setIngredientQuery(e.target.value)} placeholder={t('searchIngredients')} aria-label={t('searchIngredients')} />
              <div className="flex gap-2 text-sm">
                <Button type="button" variant="ghost" size="sm" onClick={() => setTicked((s) => new Set([...s, ...shownIngredients.map((i) => i.id)]))}>{t('tickAll')}</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setTicked((s) => new Set([...s].filter((id) => !shownIngredients.some((i) => i.id === id))))}>{t('tickNone')}</Button>
              </div>
              <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-control border border-line">
                {shownIngredients.map((i) => {
                  const elsewhere = i.supplier && i.supplier.id !== supplier?.id ? i.supplier.name : null;
                  return (
                    <li key={i.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-muted">
                        <input type="checkbox" className={checkboxClasses} checked={ticked.has(i.id)} onChange={() => setTicked((s) => toggle(s, i.id))} />
                        <span className="flex-1 text-sm text-fg">{i.name}</span>
                        {elsewhere && (
                          <span className="text-xs text-fg-muted">{ticked.has(i.id) ? t('movesFrom', { name: elsewhere }) : t('nowFrom', { name: elsewhere })}</span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </fieldset>

        {supplier && <Switch checked={isActive} onChange={setIsActive} label={t('field.active')} />}
      </form>
    </Dialog>
  );
}
