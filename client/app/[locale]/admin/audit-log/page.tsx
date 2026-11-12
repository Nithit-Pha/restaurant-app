'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, History } from 'lucide-react';
import { useGetAuditLogQuery } from '../../../../src/api/apiSlice';
import { formatDate } from '../../../../src/lib/format';
import { useRequireRole } from '../../../../src/routes/useAuthGuard';
import {
  Badge, Button, Card, EmptyState, Input, LoadingBlock, PageContainer, PageHeader, Select, Table, TBody, TD, TH, THead, TR,
  type Tone,
} from '../../../../src/components/ui';

const ENTITY_TYPES = ['USER', 'MENU_ITEM', 'ORDER', 'EXPENSE', 'SETTING', 'TABLE_LAYOUT', 'INGREDIENT', 'SUPPLIER'] as const;
type EntityType = (typeof ENTITY_TYPES)[number];
const ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'PAYMENT', 'LOGIN'] as const;
type Action = (typeof ACTIONS)[number];

const ACTION_TONES: Record<string, Tone> = {
  CREATE: 'success',
  UPDATE: 'info',
  DELETE: 'danger',
  STATUS_CHANGE: 'accent',
  PAYMENT: 'warning',
  LOGIN: 'neutral',
};

const PAGE_SIZE = 50;

const humanize = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (x) => x.toUpperCase());

/** { status: "READY", by: "x" } → "status: READY · by: x" (raw data, not translated) */
function describe(meta?: Record<string, unknown>): string {
  if (!meta) return '—';
  return Object.entries(meta)
    .map(([k, v]) => `${k}: ${typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}`)
    .join(' · ');
}

export default function AuditLogPage() {
  const t = useTranslations('auditLog');
  const tnav = useTranslations('nav');
  const locale = useLocale();
  const { ready } = useRequireRole('SUPER_ADMIN');
  const [entityType, setEntityType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(0);

  const { data, isLoading } = useGetAuditLogQuery({
    entityType: entityType || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }, { skip: !ready });

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);
  const filtered = Boolean(entityType || startDate || endDate);

  // Known values are translated; anything new from the server is shown readable.
  const entityLabel = (e: string) => ((ENTITY_TYPES as readonly string[]).includes(e) ? t(`entity.${e as EntityType}`) : humanize(e));
  const actionLabel = (a: string) => ((ACTIONS as readonly string[]).includes(a) ? t(`action.${a as Action}`) : humanize(a));
  const roleLabel = (r: string) => (['CUSTOMER', 'STAFF', 'SUPER_ADMIN'].includes(r) ? tnav(`role.${r as 'CUSTOMER' | 'STAFF' | 'SUPER_ADMIN'}`) : humanize(r));

  if (!ready) return null;

  return (
    <PageContainer wide>
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description', { count: data?.total ?? 0 })}
      />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
          {t('type')}
          <Select
            value={entityType}
            onChange={(e) => { setEntityType(e.target.value); setPage(0); }}
            className="w-44"
          >
            <option value="">{t('allTypes')}</option>
            {ENTITY_TYPES.map((e) => <option key={e} value={e}>{t(`entityPlural.${e}`)}</option>)}
          </Select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
          {t('from')}
          <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(0); }} className="!w-auto" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
          {t('to')}
          <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(0); }} className="!w-auto" />
        </label>
        {filtered && (
          <Button variant="ghost" onClick={() => { setEntityType(''); setStartDate(''); setEndDate(''); setPage(0); }}>
            {t('clearFilters')}
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <LoadingBlock label={t('loading')} />
        ) : !data || data.logs.length === 0 ? (
          <EmptyState icon={History} title={t('empty')} description={filtered ? t('emptyHint') : undefined} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('col.time')}</TH>
                <TH>{t('col.who')}</TH>
                <TH>{t('col.action')}</TH>
                <TH>{t('col.what')}</TH>
                <TH>{t('col.details')}</TH>
              </tr>
            </THead>
            <TBody>
              {data.logs.map((log) => {
                const details = describe(log.metadata);
                return (
                  <TR key={log.id} className="hover:bg-surface-hover">
                    <TD muted className="whitespace-nowrap text-xs tabular-nums">{formatDate(log.createdAt, locale)}</TD>
                    <TD>
                      <p className="font-medium text-fg">{log.actor.name}</p>
                      <p className="text-xs text-fg-muted">{roleLabel(log.actor.role)}</p>
                    </TD>
                    <TD>
                      <Badge tone={ACTION_TONES[log.action] ?? 'neutral'}>{actionLabel(log.action)}</Badge>
                    </TD>
                    <TD className="whitespace-nowrap">
                      <span className="text-fg">{entityLabel(log.entityType)}</span>
                      {log.entityId && <span className="ml-1.5 font-mono text-xs text-fg-muted">#{log.entityId.slice(0, 8)}</span>}
                    </TD>
                    <TD muted className="max-w-sm truncate text-xs" title={details}>{details}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <Button variant="secondary" size="sm" icon={ChevronLeft} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            {t('previous')}
          </Button>
          <span className="tabular-nums text-fg-muted">{t('pageOf', { page: page + 1, total: totalPages })}</span>
          <Button variant="secondary" size="sm" iconRight={ChevronRight} disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
            {t('next')}
          </Button>
        </div>
      )}
    </PageContainer>
  );
}
