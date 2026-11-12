'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ClipboardList, Plus } from 'lucide-react';
import { useGetMeQuery } from '../../../../src/api/apiSlice';
import { Link } from '@/i18n/navigation';
import { useGetIngredientsQuery } from '../../../../src/features/admin/stock/stockApi';
import NewOrderDialog from '../../../../src/features/admin/purchasing/NewOrderDialog';
import { STATUS_TONE } from '../../../../src/features/admin/purchasing/poDisplay';
import { useGetPurchaseOrdersQuery, type PoStatus } from '../../../../src/features/admin/purchasing/purchasingApi';
import { orderDayLabel } from '../../../../src/features/admin/suppliers/orderDays';
import { formatDate } from '../../../../src/lib/format';
import { useRequireRole } from '../../../../src/routes/useAuthGuard';
import {
  Badge, Button, Card, ChipGroup, EmptyState, LoadingBlock, PageContainer, PageHeader, Table, TBody, TD, TH, THead, TR, cn,
} from '../../../../src/components/ui';

type Filter = 'open' | 'draft' | 'sent' | 'done' | 'cancelled' | 'all';
const FILTERS: Record<Filter, PoStatus[] | undefined> = {
  open: ['DRAFT', 'SENT', 'PARTLY_RECEIVED'],
  draft: ['DRAFT'],
  sent: ['SENT', 'PARTLY_RECEIVED'],
  done: ['RECEIVED'],
  cancelled: ['CANCELLED'],
  all: undefined,
};

/**
 * Owner: orders to suppliers — drafts to check and send, sent ones waiting for delivery.
 * Staff: the same list, to record deliveries (Step 3d).
 */
export default function PurchaseOrdersPage() {
  const t = useTranslations('purchasing');
  const locale = useLocale();
  const { ready } = useRequireRole('STAFF');
  const { data: me } = useGetMeQuery(undefined, { skip: !ready });
  const isOwner = me?.role === 'SUPER_ADMIN';
  const [filter, setFilter] = useState<Filter>('open');
  const { data: orders = [], isLoading } = useGetPurchaseOrdersQuery({ status: FILTERS[filter] }, { skip: !ready });
  const { data: ingredients = [] } = useGetIngredientsQuery(undefined, { skip: !ready });
  const [creating, setCreating] = useState(false);

  if (!ready) return null;

  return (
    <PageContainer wide>
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        actions={isOwner ? <Button icon={Plus} onClick={() => setCreating(true)}>{t('newOrder')}</Button> : undefined}
      />

      <ChipGroup
        label={t('filter')}
        value={filter}
        onChange={setFilter}
        className="mb-4"
        options={(Object.keys(FILTERS) as Filter[]).map((f) => ({ value: f, label: t(`filters.${f}`) }))}
      />

      <Card className="overflow-hidden">
        {isLoading ? (
          <LoadingBlock label={t('loading')} />
        ) : orders.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={t('emptyTitle')}
            description={t('emptyDescription')}
            action={isOwner ? <Button icon={Plus} onClick={() => setCreating(true)}>{t('newOrder')}</Button> : undefined}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('col.number')}</TH>
                <TH>{t('col.supplier')}</TH>
                <TH>{t('col.status')}</TH>
                <TH numeric className="hidden sm:table-cell">{t('col.lines')}</TH>
                <TH className="hidden md:table-cell">{t('col.delivery')}</TH>
                <TH className="hidden md:table-cell">{t('col.created')}</TH>
              </tr>
            </THead>
            <TBody>
              {orders.map((o) => (
                <TR key={o.id}>
                  <TD className="py-2.5">
                    <Link href={`/admin/purchase-orders/${o.id}`} className="font-medium text-fg underline-offset-2 hover:underline">{o.label}</Link>
                    {o.source !== 'MANUAL' && (
                      <p className={cn('text-xs', o.source === 'EMERGENCY' ? 'font-medium text-danger' : 'text-fg-muted')}>
                        {o.orderDay ? t('orderDayLine', { day: orderDayLabel(o.orderDay, locale) }) : t(`source.${o.source}`)}
                      </p>
                    )}
                  </TD>
                  <TD>{o.supplier.name}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={STATUS_TONE[o.status]}>{t(`status.${o.status}`)}</Badge>
                      {isOwner && o.priceMissing && <Badge tone="warning">{t('deliveries.priceMissing')}</Badge>}
                    </div>
                  </TD>
                  <TD numeric muted className="hidden sm:table-cell tabular-nums">{o.lineCount}</TD>
                  <TD muted className="hidden md:table-cell">{o.expectedDate ? orderDayLabel(o.expectedDate, locale) : '—'}</TD>
                  <TD muted className="hidden md:table-cell whitespace-nowrap">{formatDate(o.createdAt, locale)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {creating && <NewOrderDialog ingredients={ingredients} onDone={() => setCreating(false)} />}
    </PageContainer>
  );
}
