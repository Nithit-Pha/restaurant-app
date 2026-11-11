'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { apiErrorMessage } from '@/lib/localized';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useSetItemOptionsMutation, type MenuItem, type ModifierGroupInput } from '../../api/apiSlice';
import { useRuleText } from '../menu/ItemOptionsDialog';
import { Alert, Button, Card, Dialog, Field, IconButton, Input, Switch, useToast } from '../../components/ui';

interface OptionDraft { key: string; id?: string; name: string; price: string; isAvailable: boolean }
interface GroupDraft { key: string; id?: string; name: string; min: string; max: string; options: OptionDraft[] }

let seq = 0;
const newKey = () => `k${++seq}`;
const newOption = (): OptionDraft => ({ key: newKey(), name: '', price: '0', isAvailable: true });
const newGroup = (): GroupDraft => ({ key: newKey(), name: '', min: '0', max: '1', options: [newOption()] });

function toDrafts(item: MenuItem): GroupDraft[] {
  return (item.modifierGroups ?? []).map((g) => ({
    key: newKey(),
    id: g.id,
    name: g.name,
    min: String(g.minSelect),
    max: String(g.maxSelect),
    options: g.modifiers.map((m) => ({ key: newKey(), id: m.id, name: m.name, price: String(Number(m.priceDelta)), isAvailable: m.isAvailable })),
  }));
}

type Problem = 'noName' | 'badMin' | 'badMax' | 'minOverMax' | 'noOptions' | 'tooFewOptions' | 'optionName' | 'optionPrice';

/** Same rules as the server (menu.routes.ts): returns the first problem, or null. */
function problemOf(g: GroupDraft): Problem | null {
  const min = Number(g.min);
  const max = Number(g.max);
  if (!g.name.trim()) return 'noName';
  if (!Number.isInteger(min) || min < 0 || min > 20) return 'badMin';
  if (!Number.isInteger(max) || max < 1 || max > 20) return 'badMax';
  if (min > max) return 'minOverMax';
  if (g.options.length === 0) return 'noOptions';
  if (min > g.options.length) return 'tooFewOptions';
  if (g.options.some((o) => !o.name.trim())) return 'optionName';
  if (g.options.some((o) => o.price.trim() === '' || !Number.isFinite(Number(o.price)))) return 'optionPrice';
  return null;
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

/** Edit an item's option groups (Size, Spice level, Extras) and their options. */
export default function ItemOptionsEditor({ item, onDone }: { item: MenuItem; onDone: () => void }) {
  const t = useTranslations('optionsEditor');
  const tc = useTranslations('common');
  const locale = useLocale();
  const ruleText = useRuleText();
  const [groups, setGroups] = useState<GroupDraft[]>(() => toDrafts(item));
  const [showProblems, setShowProblems] = useState(false);
  const [serverError, setServerError] = useState('');
  const [save, { isLoading }] = useSetItemOptionsMutation();
  const toast = useToast();

  const setGroup = (key: string, patch: Partial<GroupDraft>) =>
    setGroups((gs) => gs.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  const setOption = (gKey: string, oKey: string, patch: Partial<OptionDraft>) =>
    setGroups((gs) => gs.map((g) => (g.key === gKey ? { ...g, options: g.options.map((o) => (o.key === oKey ? { ...o, ...patch } : o)) } : g)));

  const problems = groups.map(problemOf);

  const handleSave = async () => {
    setShowProblems(true);
    setServerError('');
    if (problems.some(Boolean)) return;
    const body: ModifierGroupInput[] = groups.map((g) => ({
      ...(g.id ? { id: g.id } : {}),
      name: g.name.trim(),
      minSelect: Number(g.min),
      maxSelect: Number(g.max),
      modifiers: g.options.map((o) => ({ ...(o.id ? { id: o.id } : {}), name: o.name.trim(), priceDelta: Number(o.price), isAvailable: o.isAvailable })),
    }));
    try {
      await save({ id: item.id, groups: body }).unwrap();
      toast({ title: t('saved', { name: item.name }) });
      onDone();
    } catch (err) {
      setServerError(apiErrorMessage(err, locale, t('saveFailed')));
      toast({ tone: 'error', title: t('saveFailedFor', { name: item.name }) });
    }
  };

  return (
    <Dialog
      open
      onClose={onDone}
      size="lg"
      dismissOnBackdrop={false}
      title={t('title', { name: item.name })}
      description={t('description')}
      footer={
        <>
          <Button variant="secondary" onClick={onDone}>{tc('cancel')}</Button>
          <Button loading={isLoading} onClick={handleSave}>{t('save')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {serverError && <Alert tone="danger">{serverError}</Alert>}
        {groups.length === 0 && <p className="text-fg-muted">{t('none')}</p>}

        {groups.map((g, gi) => {
          const problem = showProblems ? problems[gi] : null;
          const min = Number(g.min);
          const max = Number(g.max);
          return (
            <Card key={g.key} className="p-4">
              <div className="flex flex-wrap items-end gap-3">
                <Field label={t('groupName')} htmlFor={`${g.key}-name`} className="min-w-[12rem] flex-1">
                  <Input id={`${g.key}-name`} value={g.name} maxLength={60} placeholder={t('groupPlaceholder')} onChange={(e) => setGroup(g.key, { name: e.target.value })} />
                </Field>
                <Field label={t('atLeast')} htmlFor={`${g.key}-min`} className="w-24">
                  <Input id={`${g.key}-min`} type="number" min={0} max={20} value={g.min} onChange={(e) => setGroup(g.key, { min: e.target.value })} />
                </Field>
                <Field label={t('atMost')} htmlFor={`${g.key}-max`} className="w-24">
                  <Input id={`${g.key}-max`} type="number" min={1} max={20} value={g.max} onChange={(e) => setGroup(g.key, { max: e.target.value })} />
                </Field>
                <div className="flex gap-1 pb-1">
                  <IconButton icon={ArrowUp} size="sm" label={t('moveGroupUp', { name: g.name || t('group') })} disabled={gi === 0} onClick={() => setGroups((gs) => move(gs, gi, gi - 1))} />
                  <IconButton icon={ArrowDown} size="sm" label={t('moveGroupDown', { name: g.name || t('group') })} disabled={gi === groups.length - 1} onClick={() => setGroups((gs) => move(gs, gi, gi + 1))} />
                  <IconButton
                    icon={Trash2}
                    size="sm"
                    label={t('removeGroup', { name: g.name || t('group') })}
                    onClick={() => setGroups((gs) => gs.filter((x) => x.key !== g.key))}
                    className="hover:!bg-danger-soft hover:!text-danger"
                  />
                </div>
              </div>
              <p className="mt-1.5 text-xs text-fg-muted">
                {t('customersSee', { rule: Number.isInteger(min) && Number.isInteger(max) && min <= max ? ruleText({ minSelect: min, maxSelect: max }) : '—' })}
              </p>

              <ul className="mt-3 space-y-2">
                {g.options.map((o, oi) => (
                  <li key={o.key} className="flex flex-wrap items-center gap-2">
                    <Input
                      value={o.name}
                      maxLength={60}
                      placeholder={t('optionPlaceholder')}
                      aria-label={t('optionName', { n: oi + 1 })}
                      onChange={(e) => setOption(g.key, o.key, { name: e.target.value })}
                      className="min-w-[10rem] flex-1"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      value={o.price}
                      aria-label={t('optionPrice', { n: oi + 1 })}
                      title={t('priceTitle')}
                      onChange={(e) => setOption(g.key, o.key, { price: e.target.value })}
                      className="w-28 text-right tabular-nums"
                    />
                    <Switch checked={o.isAvailable} onChange={(on) => setOption(g.key, o.key, { isAvailable: on })} label={t('optionAvailable', { n: oi + 1 })} hideLabel />
                    <IconButton icon={ArrowUp} size="sm" label={t('moveOptionUp', { n: oi + 1 })} disabled={oi === 0} onClick={() => setGroup(g.key, { options: move(g.options, oi, oi - 1) })} />
                    <IconButton
                      icon={Trash2}
                      size="sm"
                      label={t('removeOption', { n: oi + 1 })}
                      onClick={() => setGroup(g.key, { options: g.options.filter((x) => x.key !== o.key) })}
                      className="hover:!bg-danger-soft hover:!text-danger"
                    />
                  </li>
                ))}
              </ul>
              <Button variant="ghost" size="sm" icon={Plus} className="mt-2" onClick={() => setGroup(g.key, { options: [...g.options, newOption()] })}>
                {t('addOption')}
              </Button>
              {problem && <p className="mt-2 text-xs text-danger" role="alert">{t(`problem.${problem}`)}</p>}
            </Card>
          );
        })}

        <Button variant="secondary" icon={Plus} onClick={() => setGroups((gs) => [...gs, newGroup()])}>{t('addGroup')}</Button>
        <p className="text-xs text-fg-muted">{t('footnote')}</p>
      </div>
    </Dialog>
  );
}
