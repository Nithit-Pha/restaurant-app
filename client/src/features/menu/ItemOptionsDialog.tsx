'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { MenuItem, ModifierGroup } from '../../api/apiSlice';
import type { CartOption } from '../cart/cartSlice';
import { formatCurrency } from '../../lib/format';
import { Button, Dialog, Field, Textarea, checkboxClasses, cn } from '../../components/ui';

/** "Required" / "Optional · up to 3" / "Choose 2" / "Choose 1–3", in the page's language. */
export function useRuleText() {
  const t = useTranslations('options');
  return (g: Pick<ModifierGroup, 'minSelect' | 'maxSelect'>): string => {
    if (g.minSelect === 0) return g.maxSelect === 1 ? t('optional') : t('optionalUpTo', { max: g.maxSelect });
    if (g.minSelect === g.maxSelect) return g.minSelect === 1 ? t('required') : t('chooseExactly', { count: g.minSelect });
    return t('chooseRange', { min: g.minSelect, max: g.maxSelect });
  };
}

/** "+฿20.00" / "−฿5.00" / "" for no price change. */
export const signedPrice = (n: number) => (n > 0 ? `+${formatCurrency(n)}` : n < 0 ? `−${formatCurrency(-n)}` : '');

/**
 * Pick the item's options (size, spice level, extras) and add a note for the
 * kitchen. The price shown here is an estimate; the server prices the order.
 */
export default function ItemOptionsDialog({ item, onAdd, onClose }: {
  item: MenuItem;
  onAdd: (options: CartOption[], note: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations('options');
  const ruleText = useRuleText();
  const groups = item.modifierGroups ?? [];
  // A required single choice starts on its first option.
  const [chosen, setChosen] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(groups.map((g) => [g.id, g.minSelect === 1 && g.maxSelect === 1 && g.modifiers[0] ? [g.modifiers[0].id] : []])),
  );
  const [note, setNote] = useState('');

  const toggle = (g: ModifierGroup, id: string) => {
    setChosen((c) => {
      const now = c[g.id] ?? [];
      if (g.maxSelect === 1) return { ...c, [g.id]: now.includes(id) && g.minSelect === 0 ? [] : [id] };
      if (now.includes(id)) return { ...c, [g.id]: now.filter((x) => x !== id) };
      return now.length >= g.maxSelect ? c : { ...c, [g.id]: [...now, id] };
    });
  };

  const options: CartOption[] = groups.flatMap((g) =>
    g.modifiers.filter((m) => chosen[g.id]?.includes(m.id)).map((m) => ({ id: m.id, name: m.name, priceDelta: Number(m.priceDelta) })),
  );
  const missing = groups.filter((g) => (chosen[g.id]?.length ?? 0) < g.minSelect);
  const price = Number(item.sellingPrice) + options.reduce((s, o) => s + o.priceDelta, 0);
  const noteId = `note-${item.id}`;

  return (
    <Dialog
      open
      onClose={onClose}
      title={item.name}
      description={item.description}
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button disabled={missing.length > 0} onClick={() => onAdd(options, note)}>
            {t('addToCart', { price: formatCurrency(price) })}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {groups.map((g) => {
          // A single optional choice is a checkbox too, so it can be unticked.
          const multi = g.maxSelect > 1 || g.minSelect === 0;
          const count = chosen[g.id]?.length ?? 0;
          return (
            <fieldset key={g.id}>
              <legend className="mb-2 flex w-full items-baseline justify-between gap-2">
                <span className="font-medium text-fg">{g.name}</span>
                <span className={cn('text-xs', missing.includes(g) ? 'font-medium text-danger' : 'text-fg-muted')}>{ruleText(g)}</span>
              </legend>
              {g.modifiers.length === 0 && <p className="text-fg-muted">{t('notAvailable')}</p>}
              <div className="space-y-1.5">
                {g.modifiers.map((m) => {
                  const checked = chosen[g.id]?.includes(m.id) ?? false;
                  const full = !checked && g.maxSelect > 1 && count >= g.maxSelect;
                  return (
                    <label
                      key={m.id}
                      className={cn(
                        'flex min-h-[44px] items-center justify-between gap-3 rounded-control border px-3 py-2 transition-colors duration-150',
                        checked ? 'border-accent bg-accent/5' : 'border-line hover:bg-surface-hover',
                        full ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                      )}
                    >
                      <span className="flex items-center gap-2.5 text-fg">
                        <input
                          type={multi ? 'checkbox' : 'radio'}
                          name={`group-${g.id}`}
                          checked={checked}
                          disabled={full}
                          onChange={() => toggle(g, m.id)}
                          className={checkboxClasses}
                        />
                        {m.name}
                      </span>
                      <span className="tabular-nums text-fg-muted">{signedPrice(Number(m.priceDelta))}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        <Field label={t('kitchenNote')} htmlFor={noteId} hint={t('kitchenNoteHint')}>
          <Textarea id={noteId} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} rows={2} />
        </Field>
      </div>
    </Dialog>
  );
}
