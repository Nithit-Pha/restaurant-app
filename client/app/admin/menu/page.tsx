'use client';

import { useMemo, useState } from 'react';
import { ListChecks, Pencil, Plus, Search, Trash2, UtensilsCrossed } from 'lucide-react';
import { useGetMenuItemsQuery, useDeleteMenuItemMutation, useToggleAvailabilityMutation, type MenuItem } from '../../../src/api/apiSlice';
import MenuItemForm from '../../../src/features/admin/MenuItemForm';
import ItemOptionsEditor from '../../../src/features/admin/ItemOptionsEditor';
import { formatCurrency } from '../../../src/lib/format';
import { useRequireRole } from '../../../src/routes/useAuthGuard';
import {
  Badge, Button, Card, ChipGroup, Dialog, EmptyState, IconButton, Input, LoadingBlock, PageContainer, PageHeader, Switch,
  Table, TBody, TD, TH, THead, TR, cn, useToast,
} from '../../../src/components/ui';

export default function AdminMenuPage() {
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
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');

  // Cost price is only sent to Super Admins; staff don't get the cost columns.
  const showCost = items.some((i) => i.costPrice !== undefined && i.costPrice !== null);

  const categories = useMemo(() => Array.from(new Set(items.map((i) => i.category))).sort(), [items]);
  const hiddenCount = items.filter((i) => !i.isAvailable).length;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) => (!category || i.category === category) && (!q || i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q)),
    );
  }, [items, query, category]);

  const handleDelete = async (item: MenuItem) => {
    try {
      const res = await deleteItem(item.id).unwrap();
      toast({
        title: res?.hidden ? `${item.name} was hidden` : `${item.name} was deleted`,
        description: res?.hidden ? 'It has past orders, so it was hidden instead of deleted.' : undefined,
      });
    } catch {
      toast({ tone: 'error', title: `Could not delete ${item.name}`, description: 'Please try again.' });
    }
    setRemoving(null);
  };

  const handleToggle = async (item: MenuItem, isAvailable: boolean) => {
    try {
      await toggleAvail({ id: item.id, isAvailable }).unwrap();
      toast({ title: isAvailable ? `${item.name} is on the menu` : `${item.name} is hidden from the menu` });
    } catch {
      toast({ tone: 'error', title: `Could not change ${item.name}` });
    }
  };

  if (!ready) return null;

  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Service"
        title="Menu management"
        description={`${items.length} items${hiddenCount ? ` · ${hiddenCount} hidden from customers` : ''}`}
        actions={<Button icon={Plus} onClick={() => setCreating(true)}>Add item</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search size={16} strokeWidth={1.75} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search dishes"
            aria-label="Search dishes"
            className="pl-9"
          />
        </div>
        {categories.length > 1 && (
          <ChipGroup
            label="Filter by category"
            value={category}
            onChange={setCategory}
            options={[{ value: '', label: 'All' }, ...categories.map((c) => ({ value: c, label: c }))]}
          />
        )}
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <LoadingBlock label="Loading menu…" />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={UtensilsCrossed}
            title={items.length === 0 ? 'No menu items yet' : 'No dishes match'}
            description={items.length === 0 ? 'Add your first dish so customers can order it.' : 'Try another search or category.'}
            action={items.length === 0 ? <Button icon={Plus} onClick={() => setCreating(true)}>Add item</Button> : undefined}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Item</TH>
                <TH className="hidden md:table-cell">Category</TH>
                {showCost && <TH numeric>Cost</TH>}
                <TH numeric>Price</TH>
                {showCost && <TH numeric>Margin</TH>}
                <TH>Available</TH>
                <TH numeric><span className="sr-only">Actions</span></TH>
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
                          <p className={cn('truncate font-medium', item.isAvailable ? 'text-fg' : 'text-fg-muted')}>{item.name}</p>
                          {item.description && <p className="max-w-xs truncate text-xs text-fg-muted">{item.description}</p>}
                          {!!item.modifierGroups?.length && (
                            <p className="max-w-xs truncate text-xs text-fg-muted">
                              Options: {item.modifierGroups.map((g) => g.name).join(', ')}
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
                          <span title="Added by staff; enter the cost to get correct profit figures">
                            <Badge tone="warning">cost missing</Badge>
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
                        label={`${item.name} available to order`}
                        hideLabel
                      />
                    </TD>
                    <TD numeric>
                      <div className="flex justify-end gap-1">
                        <IconButton icon={ListChecks} label={`Options for ${item.name}`} size="sm" onClick={() => setOptionsFor(item)} />
                        <IconButton icon={Pencil} label={`Edit ${item.name}`} size="sm" onClick={() => setEditing(item)} />
                        <IconButton
                          icon={Trash2}
                          label={`Delete ${item.name}`}
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

      <Dialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        size="sm"
        title={`Delete ${removing?.name ?? ''}?`}
        description="If customers have ordered it before, it is hidden instead, so past orders stay correct."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)} data-autofocus>Keep it</Button>
            <Button variant="danger" loading={deleting} onClick={() => removing && handleDelete(removing)}>Delete</Button>
          </>
        }
      />
    </PageContainer>
  );
}
