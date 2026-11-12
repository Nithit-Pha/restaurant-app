'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Boxes, ClipboardCheck, History, PackagePlus, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useGetMeQuery } from '../../../../src/api/apiSlice';
import IngredientDialog from '../../../../src/features/admin/stock/IngredientDialog';
import StockMoveDialog, { type MoveKind } from '../../../../src/features/admin/stock/StockMoveDialog';
import {
  formatAmount, useGetIngredientsQuery, useGetStockMovementsQuery, type Ingredient, type StockMoveType,
} from '../../../../src/features/admin/stock/stockApi';
import { formatDate } from '../../../../src/lib/format';
import { useRequireRole } from '../../../../src/routes/useAuthGuard';
import {
  Badge, Button, Card, CardHeader, ChipGroup, EmptyState, IconButton, Input, LoadingBlock, PageContainer, PageHeader, Switch,
  Table, TBody, TD, TH, THead, TR, cn, type Tone,
} from '../../../../src/components/ui';

const MOVE_TONE: Record<StockMoveType, Tone> = {
  SALE: 'neutral', SALE_RETURN: 'info', PURCHASE: 'success', COUNT_ADJUST: 'accent', WASTE: 'danger',
};

/** Ingredients in stock: staff record stock in, counts and waste; the owner also adds and edits ingredients. */
export default function StockPage() {
  const t = useTranslations('stock');
  const locale = useLocale();
  const { ready } = useRequireRole('STAFF');
  const { data: me } = useGetMeQuery(undefined, { skip: !ready });
  const isOwner = me?.role === 'SUPER_ADMIN';
  const [showInactive, setShowInactive] = useState(false);
  const { data: ingredients = [], isLoading } = useGetIngredientsQuery({ all: showInactive }, { skip: !ready });
  const [historyFor, setHistoryFor] = useState<Ingredient | null>(null);
  const { data: moves = [], isLoading: movesLoading } = useGetStockMovementsQuery(
    { ingredientId: historyFor?.id, limit: 100 },
    { skip: !ready },
  );

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'' | 'low'>('');
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [creating, setCreating] = useState(false);
  const [move, setMove] = useState<{ kind: MoveKind; ingredient: Ingredient } | null>(null);

  const lowCount = ingredients.filter((i) => i.low).length;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ingredients.filter(
      (i) => (!filter || i.low) && (!q || [i.name, i.storage, i.supplier?.name].some((s) => s?.toLowerCase().includes(q))),
    );
  }, [ingredients, query, filter]);

  const unit = (u: string) => t(`unit.${u}`);
  const showHistory = (i: Ingredient) => {
    setHistoryFor(i);
    document.getElementById('stock-history')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (!ready) return null;

  return (
    <PageContainer wide>
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={lowCount ? `${t('count', { count: ingredients.length })} · ${t('lowCount', { count: lowCount })}` : t('count', { count: ingredients.length })}
        actions={isOwner ? <Button icon={Plus} onClick={() => setCreating(true)}>{t('addIngredient')}</Button> : undefined}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search size={16} strokeWidth={1.75} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('search')} aria-label={t('search')} className="pl-9" />
        </div>
        <ChipGroup
          label={t('filter')}
          value={filter}
          onChange={setFilter}
          options={[{ value: '', label: t('filterAll') }, { value: 'low', label: t('filterLow', { count: lowCount }) }]}
        />
        {isOwner && <Switch checked={showInactive} onChange={setShowInactive} label={t('showInactive')} />}
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <LoadingBlock label={t('loading')} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title={ingredients.length === 0 ? t('emptyTitle') : t('noMatch')}
            description={ingredients.length === 0 ? (isOwner ? t('emptyDescriptionOwner') : t('emptyDescriptionStaff')) : t('noMatchDescription')}
            action={ingredients.length === 0 && isOwner ? <Button icon={Plus} onClick={() => setCreating(true)}>{t('addIngredient')}</Button> : undefined}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('col.ingredient')}</TH>
                <TH numeric>{t('col.inStock')}</TH>
                <TH numeric className="hidden sm:table-cell">{t('col.lowAt')}</TH>
                <TH numeric><span className="sr-only">{t('col.actions')}</span></TH>
              </tr>
            </THead>
            <TBody>
              {visible.map((i) => {
                const qty = Number(i.quantity);
                return (
                  <TR key={i.id} className={cn(!i.isActive && 'bg-surface-muted/40')}>
                    <TD className="py-2.5">
                      <p className={cn('font-medium', i.isActive ? 'text-fg' : 'text-fg-muted')}>{i.name}</p>
                      <p className="text-xs text-fg-muted">
                        {[i.supplier?.name, i.storage, !i.isActive && t('switchedOff')].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </TD>
                    <TD numeric>
                      <div className="flex items-center justify-end gap-2">
                        {i.low && (
                          <Badge tone={qty <= 0 || i.emergency ? 'danger' : 'warning'}>
                            {qty <= 0 ? t('out') : i.emergency ? t('emergency') : t('low')}
                          </Badge>
                        )}
                        <span className={cn('font-semibold tabular-nums', qty < 0 && 'text-danger')}>
                          {formatAmount(qty, locale)} <span className="font-normal text-fg-muted">{unit(i.unit)}</span>
                        </span>
                      </div>
                      {i.orderPacks > 0 && (
                        <p className="mt-0.5 text-xs text-fg-muted">
                          {i.packName
                            ? t('orderPacksNamed', { count: i.orderPacks, pack: i.packName })
                            : t('orderPacks', { count: i.orderPacks, amount: formatAmount(i.orderPacks * Number(i.packSize), locale), unit: unit(i.unit) })}
                        </p>
                      )}
                    </TD>
                    <TD numeric muted className="hidden sm:table-cell tabular-nums">
                      {formatAmount(i.reorderLevel, locale)} {unit(i.unit)}
                    </TD>
                    <TD numeric>
                      <div className="flex justify-end gap-1">
                        {i.isActive && (
                          <>
                            <IconButton icon={PackagePlus} label={t('inFor', { name: i.name })} size="sm" onClick={() => setMove({ kind: 'in', ingredient: i })} />
                            <IconButton icon={ClipboardCheck} label={t('countFor', { name: i.name })} size="sm" onClick={() => setMove({ kind: 'count', ingredient: i })} />
                            <IconButton
                              icon={Trash2}
                              label={t('wasteFor', { name: i.name })}
                              size="sm"
                              onClick={() => setMove({ kind: 'waste', ingredient: i })}
                              className="hover:!bg-danger-soft hover:!text-danger"
                            />
                          </>
                        )}
                        <IconButton icon={History} label={t('historyFor', { name: i.name })} size="sm" onClick={() => showHistory(i)} />
                        {isOwner && <IconButton icon={Pencil} label={t('editFor', { name: i.name })} size="sm" onClick={() => setEditing(i)} />}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <Card id="stock-history" className="mt-6 scroll-mt-20 overflow-hidden">
        <CardHeader
          title={historyFor ? t('historyTitleFor', { name: historyFor.name }) : t('historyTitle')}
          description={t('historyDescription')}
          actions={historyFor ? <Button variant="ghost" size="sm" icon={X} onClick={() => setHistoryFor(null)}>{t('historyAll')}</Button> : undefined}
        />
        {movesLoading ? (
          <LoadingBlock label={t('loading')} />
        ) : moves.length === 0 ? (
          <EmptyState icon={History} title={t('historyEmpty')} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('col.when')}</TH>
                {!historyFor && <TH>{t('col.ingredient')}</TH>}
                <TH>{t('col.what')}</TH>
                <TH numeric>{t('col.change')}</TH>
                <TH numeric className="hidden sm:table-cell">{t('col.after')}</TH>
                <TH className="hidden md:table-cell">{t('col.reason')}</TH>
                <TH className="hidden md:table-cell">{t('col.by')}</TH>
              </tr>
            </THead>
            <TBody>
              {moves.map((m) => {
                const change = Number(m.change);
                return (
                  <TR key={m.id}>
                    <TD muted className="whitespace-nowrap">{formatDate(m.createdAt, locale)}</TD>
                    {!historyFor && <TD>{m.ingredient.name}</TD>}
                    <TD><Badge tone={MOVE_TONE[m.type]}>{t(`move.${m.type}`)}</Badge></TD>
                    <TD numeric className={cn('font-semibold tabular-nums', change > 0 ? 'text-success' : change < 0 && 'text-danger')}>
                      {change > 0 ? '+' : ''}{formatAmount(change, locale)} {unit(m.ingredient.unit)}
                    </TD>
                    <TD numeric muted className="hidden sm:table-cell tabular-nums">{formatAmount(m.quantityAfter, locale)}</TD>
                    <TD muted className="hidden md:table-cell">{m.reason ?? '—'}</TD>
                    <TD muted className="hidden md:table-cell">{m.user?.name ?? '—'}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      {(creating || editing) && (
        <IngredientDialog key={editing?.id ?? 'new'} ingredient={editing ?? undefined} onDone={() => { setCreating(false); setEditing(null); }} />
      )}
      {move && (
        <StockMoveDialog
          key={`${move.kind}-${move.ingredient.id}`}
          kind={move.kind}
          ingredient={move.ingredient}
          isOwner={isOwner}
          onDone={() => setMove(null)}
        />
      )}
    </PageContainer>
  );
}
