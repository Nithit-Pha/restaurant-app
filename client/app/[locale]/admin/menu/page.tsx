'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CookingPot, ListChecks, Pencil, Plus, Search, Trash2, UtensilsCrossed } from 'lucide-react';
import {
  useGetMeQuery, useGetMenuItemsQuery, useDeleteMenuItemMutation, useToggleAvailabilityMutation, type MenuItem,
} from '../../../../src/api/apiSlice';
import MenuItemForm from '../../../../src/features/admin/MenuItemForm';
import ItemOptionsEditor from '../../../../src/features/admin/ItemOptionsEditor';
import RecipeDialog from '../../../../src/features/admin/stock/RecipeDialog';
import { formatCurrency } from '../../../../src/lib/format';
import { useRequireRole } from '../../../../src/routes/useAuthGuard';
import {
  Badge, Button, Card, ChipGroup, Dialog, EmptyState, IconButton, Input, LoadingBlock, PageContainer, PageHeader, Switch,
  Table, TBody, TD, TH, THead, TR, cn, useToast,
} from '../../../../src/components/ui';

export default function AdminMenuPage() {
  const t = useTranslations('adminMenu');
  const tc = useTranslations('common');
  const { ready } = useRequireRole('STAFF');
  // available: false = include hidden items, so they can be switched back on.
  const { data: items = [], isLoading } = useGetMenuItemsQuery({ available: false }, { skip: !ready });
  const [deleteItem, { isLoading: deleting }] = useDeleteMenuItemMutation();
  const [toggleAvail] = useToggleAvailabilityMutation();
  const toast = useToast();
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<MenuItem | null>(null);
  const [optionsFor, setOptionsFor] = useState<MenuItem | null>(null);
  const [recipeFor, setRecipeFor] = useState<MenuItem | null>(null);
  const { data: me } = useGetMeQuery(undefined, { skip: !ready });
  const isOwner = me?.role === 'SUPER_ADMIN';
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');

  // Cost price is only sent to Super Admins; staff don't get the cost columns.
  const showCost = items.some((i) => i.costPrice !== undefined && i.costPrice !== null);

  const categories = useMemo(() => Array.from(new Set(items.map((i) => i.category))).sort(), [items]);
  const hiddenCount = items.filter((i) => !i.isAvailable).length;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) => (!category || i.category === category)
        && (!q || [i.name, i.description, i.nameTh, i.descriptionTh].some((s) => s?.toLowerCase().includes(q))),
    );
  }, [items, query, category]);

  const handleDelete = async (item: MenuItem) => {
    try {
      const res = await deleteItem(item.id).unwrap();
      toast({
        title: res?.hidden ? t('hidden', { name: item.name }) : t('deleted', { name: item.name }),
        description: res?.hidden ? t('hiddenWhy') : undefined,
      });
    } catch {
      toast({ tone: 'error', title: t('deleteFailed', { name: item.name }), description: tc('tryAgain') });
    }
    setRemoving(null);
  };

  const handleToggle = async (item: MenuItem, isAvailable: boolean) => {
    try {
      await toggleAvail({ id: item.id, isAvailable }).unwrap();
      toast({ title: isAvailable ? t('onMenu', { name: item.name }) : t('offMenu', { name: item.name }) });
    } catch {
      toast({ tone: 'error', title: t('changeFailed', { name: item.name }) });
    }
  };

  if (!ready) return null;

  return (
    <PageContainer wide>
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={hiddenCount ? `${t('itemCount', { count: items.length })} · ${t('hiddenCount', { count: hiddenCount })}` : t('itemCount', { count: items.length })}
        actions={<Button icon={Plus} onClick={() => setCreating(true)}>{t('addItem')}</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search size={16} strokeWidth={1.75} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search')}
            aria-label={t('search')}
            className="pl-9"
          />
        </div>
        {categories.length > 1 && (
          <ChipGroup
            label={t('filterByCategory')}
            value={category}
            onChange={setCategory}
            options={[{ value: '', label: t('all') }, ...categories.map((c) => ({ value: c, label: c }))]}
          />
        )}
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <LoadingBlock label={t('loading')} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={UtensilsCrossed}
            title={items.length === 0 ? t('emptyTitle') : t('noMatch')}
            description={items.length === 0 ? t('emptyDescription') : t('noMatchDescription')}
            action={items.length === 0 ? <Button icon={Plus} onClick={() => setCreating(true)}>{t('addItem')}</Button> : undefined}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('col.item')}</TH>
                <TH className="hidden md:table-cell">{t('col.category')}</TH>
                {showCost && <TH numeric>{t('col.cost')}</TH>}
                <TH numeric>{t('col.price')}</TH>
                {showCost && <TH numeric>{t('col.margin')}</TH>}
                <TH>{t('col.available')}</TH>
                <TH numeric><span className="sr-only">{t('col.actions')}</span></TH>
              </tr>
            </THead>
            <TBody>
              {visible.map((item) => {
                // The API sends Decimal prices as strings ("9.99"); convert before maths.
                const price = Number(item.sellingPrice);
                const cost = Number(item.costPrice);
                const margin = price > 0 ? (((price - cost) / price) * 100).toFixed(1) : '—';
                return (
                  <TR key={item.id} className={cn(!item.isAvailable && 'bg-surface-muted/40')}>
                    <TD className="py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-control bg-surface-muted text-fg-subtle">
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <UtensilsCrossed size={16} strokeWidth={1.5} aria-hidden />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className={cn('flex items-center gap-2 truncate font-medium', item.isAvailable ? 'text-fg' : 'text-fg-muted')}>
                            <span className="truncate">{item.name}</span>
                            {item.soldOut && (
                              <span title={t('soldOutTitle')}><Badge tone="danger">{t('soldOut')}</Badge></span>
                            )}
                          </p>
                          {item.nameTh && <p lang="th" className="max-w-xs truncate text-xs text-fg-muted">{item.nameTh}</p>}
                          {item.description && <p className="max-w-xs truncate text-xs text-fg-muted">{item.description}</p>}
                          {!!item.modifierGroups?.length && (
                            <p className="max-w-xs truncate text-xs text-fg-muted">
                              {t('optionsList', { names: item.modifierGroups.map((g) => g.name).join(', ') })}
                            </p>
                          )}
                        </div>
                      </div>
                    </TD>
                    <TD muted className="hidden md:table-cell">{item.category}</TD>
                    {showCost && (
                      <TD numeric muted>
                        {cost > 0 ? (
                          formatCurrency(cost)
                        ) : (
                          <span title={t('costMissingTitle')}>
                            <Badge tone="warning">{t('costMissing')}</Badge>
                          </span>
                        )}
                      </TD>
                    )}
                    <TD numeric className="font-semibold">{formatCurrency(price)}</TD>
                    {showCost && (
                      <TD numeric className={cn(cost > 0 && (cost > price ? 'text-danger' : 'text-success'))}>
                        {cost > 0 ? `${margin}%` : '—'}
                      </TD>
                    )}
                    <TD>
                      <Switch
                        checked={item.isAvailable}
                        onChange={(on) => handleToggle(item, on)}
                        label={t('availableLabel', { name: item.name })}
                        hideLabel
                      />
                    </TD>
                    <TD numeric>
                      <div className="flex justify-end gap-1">
                        {isOwner && <IconButton icon={CookingPot} label={t('recipeFor', { name: item.name })} size="sm" onClick={() => setRecipeFor(item)} />}
                        <IconButton icon={ListChecks} label={t('optionsFor', { name: item.name })} size="sm" onClick={() => setOptionsFor(item)} />
                        <IconButton icon={Pencil} label={t('edit', { name: item.name })} size="sm" onClick={() => setEditing(item)} />
                        <IconButton
                          icon={Trash2}
                          label={t('delete', { name: item.name })}
                          size="sm"
                          onClick={() => setRemoving(item)}
                          className="hover:!bg-danger-soft hover:!text-danger"
                        />
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      {(creating || editing) && (
        <MenuItemForm
          key={editing?.id ?? 'new'}
          item={editing ?? undefined}
          onDone={() => { setCreating(false); setEditing(null); }}
        />
      )}

      {optionsFor && <ItemOptionsEditor key={optionsFor.id} item={optionsFor} onDone={() => setOptionsFor(null)} />}
      {recipeFor && <RecipeDialog key={recipeFor.id} item={recipeFor} onDone={() => setRecipeFor(null)} />}

      <Dialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        size="sm"
        title={t('deleteTitle', { name: removing?.name ?? '' })}
        description={t('deleteDescription')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)} data-autofocus>{t('keepIt')}</Button>
            <Button variant="danger" loading={deleting} onClick={() => removing && handleDelete(removing)}>{t('deleteButton')}</Button>
          </>
        }
      />
    </PageContainer>
  );
}
