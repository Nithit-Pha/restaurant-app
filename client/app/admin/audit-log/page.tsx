'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, History } from 'lucide-react';
import { useGetAuditLogQuery } from '../../../src/api/apiSlice';
import { formatDate } from '../../../src/lib/format';
import { useRequireRole } from '../../../src/routes/useAuthGuard';
import {
  Badge, Button, Card, EmptyState, Input, LoadingBlock, PageContainer, PageHeader, Select, Table, TBody, TD, TH, THead, TR,
  type Tone,
} from '../../../src/components/ui';

const ENTITY_TYPES = ['', 'USER', 'MENU_ITEM', 'ORDER', 'EXPENSE', 'SETTING'];
const ENTITY_LABELS: Record<string, string> = {
  USER: 'Users',
  MENU_ITEM: 'Menu items',
  ORDER: 'Orders',
  EXPENSE: 'Expenses',
  SETTING: 'Settings',
};

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

/** { status: "READY", by: "x" } → "status: READY · by: x" */
function describe(meta?: Record<string, unknown>): string {
  if (!meta) return '—';
  return Object.entries(meta)
    .map(([k, v]) => `${k}: ${typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}`)
    .join(' · ');
}

export default function AuditLogPage() {
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

  if (!ready) return null;

  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Business"
        title="Audit log"
        description={`Every change made by staff and owners · ${data?.total ?? 0} entries`}
      />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
          Type
          <Select
            value={entityType}
            onChange={(e) => { setEntityType(e.target.value); setPage(0); }}
            className="w-44"
          >
            {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t ? ENTITY_LABELS[t] ?? humanize(t) : 'All types'}</option>)}
          </Select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
          From
          <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(0); }} className="!w-auto" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-fg">
          To
          <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(0); }} className="!w-auto" />
        </label>
        {filtered && (
          <Button variant="ghost" onClick={() => { setEntityType(''); setStartDate(''); setEndDate(''); setPage(0); }}>
            Clear filters
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <LoadingBlock label="Loading audit log…" />
        ) : !data || data.logs.length === 0 ? (
          <EmptyState icon={History} title="No entries found" description={filtered ? 'Try a wider date range or another type.' : undefined} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Time</TH>
                <TH>Who</TH>
                <TH>Action</TH>
                <TH>What</TH>
                <TH>Details</TH>
              </tr>
            </THead>
            <TBody>
              {data.logs.map((log) => {
                const details = describe(log.metadata);
                return (
                  <TR key={log.id} className="hover:bg-surface-hover">
                    <TD muted className="whitespace-nowrap text-xs tabular-nums">{formatDate(log.createdAt)}</TD>
                    <TD>
                      <p className="font-medium text-fg">{log.actor.name}</p>
                      <p className="text-xs text-fg-muted">{humanize(log.actor.role)}</p>
                    </TD>
                    <TD>
                      <Badge tone={ACTION_TONES[log.action] ?? 'neutral'}>{humanize(log.action)}</Badge>
                    </TD>
                    <TD className="whitespace-nowrap">
                      <span className="text-fg">{humanize(log.entityType)}</span>
                      {log.entityId && <span className="ml-1.5 font-mono text-xs text-fg-subtle">#{log.entityId.slice(0, 8)}</span>}
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
            Previous
          </Button>
          <span className="tabular-nums text-fg-muted">Page {page + 1} of {totalPages}</span>
          <Button variant="secondary" size="sm" iconRight={ChevronRight} disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </PageContainer>
  );
}
