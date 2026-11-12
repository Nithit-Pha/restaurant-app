'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarClock, Lock, Mail, MessageCircle, Pencil, Phone, Plus, Truck } from 'lucide-react';
import { usePermissions } from '../../../../src/features/permissions/permissionsApi';
import { useGetIngredientsQuery } from '../../../../src/features/admin/stock/stockApi';
import SupplierDialog from '../../../../src/features/admin/suppliers/SupplierDialog';
import { orderDayLabel, scheduleSummary } from '../../../../src/features/admin/suppliers/orderDays';
import { useGetSuppliersQuery, type Supplier } from '../../../../src/features/admin/suppliers/suppliersApi';
import { formatCurrency } from '../../../../src/lib/format';
import { useRequireRole } from '../../../../src/routes/useAuthGuard';
import {
  Badge, Button, Card, EmptyState, IconButton, LoadingBlock, PageContainer, PageHeader, Switch, cn,
} from '../../../../src/components/ui';

/** Owner (or staff when allowed): the suppliers, when each is ordered from, and which ingredients it delivers. */
export default function SuppliersPage() {
  const t = useTranslations('suppliers');
  const locale = useLocale();
  const { ready: signedIn } = useRequireRole('STAFF');
  const { can, loading } = usePermissions();
  const allowed = can('suppliers.edit');
  const ready = signedIn && allowed;
  const [showInactive, setShowInactive] = useState(false);
  const { data: suppliers = [], isLoading } = useGetSuppliersQuery({ all: showInactive }, { skip: !ready });
  const { data: ingredients = [], isLoading: ingredientsLoading } = useGetIngredientsQuery(undefined, { skip: !ready });
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [creating, setCreating] = useState(false);

  if (signedIn && !loading && !allowed) {
    return <PageContainer><EmptyState icon={Lock} title={t('noAccess')} description={t('noAccessHint')} /></PageContainer>;
  }
  if (!ready) return null;

  const unassigned = ingredients.filter((i) => !i.supplierId).length;
  const lowFor = (s: Supplier) => ingredients.filter((i) => i.supplierId === s.id && i.low).length;
  const draftLine = (s: Supplier) => (s.draftTime ? t('draftLineTime', { time: s.draftTime }) : t('draftLineClose'));

  return (
    <PageContainer wide>
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={[t('count', { count: suppliers.length }), unassigned > 0 && t('unassigned', { count: unassigned })].filter(Boolean).join(' · ')}
        actions={<Button icon={Plus} onClick={() => setCreating(true)} disabled={ingredientsLoading}>{t('addSupplier')}</Button>}
      />

      <div className="mb-4 flex justify-end">
        <Switch checked={showInactive} onChange={setShowInactive} label={t('showInactive')} />
      </div>

      {isLoading || ingredientsLoading ? (
        <Card><LoadingBlock label={t('loading')} /></Card>
      ) : suppliers.length === 0 ? (
        <Card>
          <EmptyState
            icon={Truck}
            title={t('emptyTitle')}
            description={t('emptyDescription')}
            action={<Button icon={Plus} onClick={() => setCreating(true)}>{t('addSupplier')}</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {suppliers.map((s) => {
            const low = lowFor(s);
            return (
              <Card key={s.id} className={cn('flex flex-col p-4', !s.isActive && 'bg-surface-muted/40')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className={cn('truncate text-base font-semibold', s.isActive ? 'text-fg' : 'text-fg-muted')}>{s.name}</h2>
                    <p className="text-sm text-fg-muted">{s.contactName ?? '—'}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {!s.isActive && <Badge tone="neutral">{t('switchedOff')}</Badge>}
                    {s.isActive && low > 0 && <Badge tone="warning">{t('lowCount', { count: low })}</Badge>}
                    <IconButton icon={Pencil} label={t('editFor', { name: s.name })} size="sm" onClick={() => setEditing(s)} />
                  </div>
                </div>

                <ul className="mt-3 space-y-1 text-sm text-fg-muted">
                  {s.phone && <li className="flex items-center gap-2"><Phone size={14} aria-hidden /><a href={`tel:${s.phone}`} className="hover:text-fg">{s.phone}</a></li>}
                  {s.lineId && <li className="flex items-center gap-2"><MessageCircle size={14} aria-hidden />LINE {s.lineId}</li>}
                  {s.email && <li className="flex items-center gap-2"><Mail size={14} aria-hidden /><a href={`mailto:${s.email}`} className="truncate hover:text-fg">{s.email}</a></li>}
                </ul>

                <div className="mt-3 rounded-control bg-surface-muted p-3 text-sm">
                  <p className="flex items-center gap-2 font-medium text-fg"><CalendarClock size={14} aria-hidden />{scheduleSummary(s, locale, t)}</p>
                  <p className="mt-1 text-xs text-fg-muted">{draftLine(s)}</p>
                  {s.cutOffTime && <p className="text-xs text-fg-muted">{t('cutOffLine', { time: s.cutOffTime })}</p>}
                  {s.minOrder && <p className="text-xs text-fg-muted">{t('minOrderLine', { amount: formatCurrency(Number(s.minOrder)) })}</p>}
                  {s.nextOrderDays.length > 0 && (
                    <p className="mt-2 text-xs text-fg">
                      {t('nextOrders')}: <span className="tabular-nums">{s.nextOrderDays.map((d) => orderDayLabel(d, locale)).join(' · ')}</span>
                    </p>
                  )}
                </div>

                <p className="mt-3 text-xs font-medium uppercase tracking-wide text-fg-subtle">{t('delivers', { count: s.ingredients.length })}</p>
                <p className="mt-1 text-sm text-fg-muted">
                  {s.ingredients.length ? s.ingredients.map((i) => i.name).join(', ') : t('nothingTicked')}
                </p>
              </Card>
            );
          })}
        </div>
      )}

      {(creating || editing) && (
        <SupplierDialog
          key={editing?.id ?? 'new'}
          supplier={editing ?? undefined}
          ingredients={ingredients}
          onDone={() => { setCreating(false); setEditing(null); }}
        />
      )}
    </PageContainer>
  );
}
