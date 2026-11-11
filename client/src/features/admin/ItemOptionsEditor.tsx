'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useSetItemOptionsMutation, type MenuItem, type ModifierGroupInput } from '../../api/apiSlice';
import { ruleText } from '../menu/ItemOptionsDialog';
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

/** Same rules as the server (menu.routes.ts): returns the first problem, or null. */
function problemOf(g: GroupDraft): string | null {
  const min = Number(g.min);
  const max = Number(g.max);
  if (!g.name.trim()) return 'Give the group a name, e.g. Size.';
  if (!Number.isInteger(min) || min < 0 || min > 20) return 'Minimum must be a whole number from 0 to 20.';
  if (!Number.isInteger(max) || max < 1 || max > 20) return 'Maximum must be a whole number from 1 to 20.';
  if (min > max) return 'Minimum cannot be more than maximum.';
  if (g.options.length === 0) return 'Add at least one option.';
  if (min > g.options.length) return 'More choices required than there are options.';
  if (g.options.some((o) => !o.name.trim())) return 'Every option needs a name.';
  if (g.options.some((o) => o.price.trim() === '' || !Number.isFinite(Number(o.price)))) return 'Every price change must be a number (0 for none).';
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
      toast({ title: `Options for ${item.name} saved` });
      onDone();
    } catch (err) {
      const msg = (err as { data?: { message?: string } })?.data?.message;
      setServerError(msg || 'Could not save the options. Please try again.');
      toast({ tone: 'error', title: `Could not save the options for ${item.name}` });
    }
  };

  return (
    <Dialog
      open
      onClose={onDone}
      size="lg"
      dismissOnBackdrop={false}
      title={`Options for ${item.name}`}
      description="Choices customers make when they add this dish, e.g. Size or Extras. The price change is added to the dish price."
      footer={
        <>
          <Button variant="secondary" onClick={onDone}>Cancel</Button>
          <Button loading={isLoading} onClick={handleSave}>Save options</Button>
        </>
      }
    >
      <div className="space-y-4">
        {serverError && <Alert tone="danger">{serverError}</Alert>}
        {groups.length === 0 && <p className="text-fg-muted">This dish has no options. Customers add it straight to the cart.</p>}

        {groups.map((g, gi) => {
          const problem = showProblems ? problems[gi] : null;
          const min = Number(g.min);
          const max = Number(g.max);
          return (
            <Card key={g.key} className="p-4">
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Group name" htmlFor={`${g.key}-name`} className="min-w-[12rem] flex-1">
                  <Input id={`${g.key}-name`} value={g.name} maxLength={60} placeholder="e.g. Size" onChange={(e) => setGroup(g.key, { name: e.target.value })} />
                </Field>
                <Field label="At least" htmlFor={`${g.key}-min`} className="w-24">
                  <Input id={`${g.key}-min`} type="number" min={0} max={20} value={g.min} onChange={(e) => setGroup(g.key, { min: e.target.value })} />
                </Field>
                <Field label="At most" htmlFor={`${g.key}-max`} className="w-24">
                  <Input id={`${g.key}-max`} type="number" min={1} max={20} value={g.max} onChange={(e) => setGroup(g.key, { max: e.target.value })} />
                </Field>
                <div className="flex gap-1 pb-1">
                  <IconButton icon={ArrowUp} size="sm" label={`Move ${g.name || 'group'} up`} disabled={gi === 0} onClick={() => setGroups((gs) => move(gs, gi, gi - 1))} />
                  <IconButton icon={ArrowDown} size="sm" label={`Move ${g.name || 'group'} down`} disabled={gi === groups.length - 1} onClick={() => setGroups((gs) => move(gs, gi, gi + 1))} />
                  <IconButton
                    icon={Trash2}
                    size="sm"
                    label={`Remove ${g.name || 'group'}`}
                    onClick={() => setGroups((gs) => gs.filter((x) => x.key !== g.key))}
                    className="hover:!bg-danger-soft hover:!text-danger"
                  />
                </div>
              </div>
              <p className="mt-1.5 text-xs text-fg-muted">
                Customers see: {Number.isInteger(min) && Number.isInteger(max) && min <= max ? ruleText({ minSelect: min, maxSelect: max }) : '—'}
              </p>

              <ul className="mt-3 space-y-2">
                {g.options.map((o, oi) => (
                  <li key={o.key} className="flex flex-wrap items-center gap-2">
                    <Input
                      value={o.name}
                      maxLength={60}
                      placeholder="Option, e.g. Large"
                      aria-label={`Option ${oi + 1} name`}
                      onChange={(e) => setOption(g.key, o.key, { name: e.target.value })}
                      className="min-w-[10rem] flex-1"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      value={o.price}
                      aria-label={`Option ${oi + 1} price change in baht`}
                      title="Price change in baht (negative for a discount)"
                      onChange={(e) => setOption(g.key, o.key, { price: e.target.value })}
                      className="w-28 text-right tabular-nums"
                    />
                    <Switch checked={o.isAvailable} onChange={(on) => setOption(g.key, o.key, { isAvailable: on })} label={`Option ${oi + 1} available`} hideLabel />
                    <IconButton icon={ArrowUp} size="sm" label={`Move option ${oi + 1} up`} disabled={oi === 0} onClick={() => setGroup(g.key, { options: move(g.options, oi, oi - 1) })} />
                    <IconButton
                      icon={Trash2}
                      size="sm"
                      label={`Remove option ${oi + 1}`}
                      onClick={() => setGroup(g.key, { options: g.options.filter((x) => x.key !== o.key) })}
                      className="hover:!bg-danger-soft hover:!text-danger"
                    />
                  </li>
                ))}
              </ul>
              <Button variant="ghost" size="sm" icon={Plus} className="mt-2" onClick={() => setGroup(g.key, { options: [...g.options, newOption()] })}>
                Add option
              </Button>
              {problem && <p className="mt-2 text-xs text-danger" role="alert">{problem}</p>}
            </Card>
          );
        })}

        <Button variant="secondary" icon={Plus} onClick={() => setGroups((gs) => [...gs, newGroup()])}>Add option group</Button>
        <p className="text-xs text-fg-muted">Turn an option off when it runs out; past orders keep their options either way.</p>
      </div>
    </Dialog>
  );
}
