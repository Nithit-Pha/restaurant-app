'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { LayoutGrid, Pencil, Plus, QrCode, Trash2 } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import {
  useCreateZoneMutation, useDeleteZoneMutation, useGetFloorQuery, useUpdateZoneMutation, type ZoneInput,
} from '../../../../src/api/apiSlice';
import FloorEditor from '../../../../src/features/admin/tables/FloorEditor';
import { ConfirmDialog, ZoneDialog } from '../../../../src/features/admin/tables/ZoneDialogs';
import { labelKey } from '../../../../src/features/admin/tables/layoutRules';
import { useRequireRole } from '../../../../src/routes/useAuthGuard';
import {
  Button, EmptyState, IconButton, LoadingBlock, PageContainer, PageHeader, buttonClasses, cn, useToast,
} from '../../../../src/components/ui';

const errorMessage = (err: unknown) => (err as { data?: { message?: string } })?.data?.message;

export default function FloorPlanPage() {
  const t = useTranslations('floorPlan');
  const tc = useTranslations('common');
  const { ready } = useRequireRole('SUPER_ADMIN');
  const toast = useToast();
  const { data: zones = [], isLoading } = useGetFloorQuery(undefined, { skip: !ready });
  const [createZone, { isLoading: creating }] = useCreateZoneMutation();
  const [updateZone, { isLoading: updating }] = useUpdateZoneMutation();
  const [deleteZone, { isLoading: deleting }] = useDeleteZoneMutation();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const [zoneDialog, setZoneDialog] = useState<'add' | 'edit' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const active = zones.find((z) => z.id === activeId) ?? zones[0];
  useEffect(() => {
    if (!activeId && zones[0]) setActiveId(zones[0].id);
  }, [activeId, zones]);

  // Names used in the other zones: a table name is unique across the restaurant.
  const otherLabels = useMemo(
    () => new Set(zones.filter((z) => z.id !== active?.id).flatMap((z) => z.tables.map((tb) => labelKey(tb.label)))),
    [zones, active?.id],
  );

  // Warn before leaving the page with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const onDirtyChange = useCallback((d: boolean) => setDirty(d), []);

  const switchTo = (id: string) => {
    if (id === active?.id) return;
    if (dirty) setPendingSwitch(id);
    else setActiveId(id);
  };

  const submitZone = async (input: ZoneInput) => {
    try {
      if (zoneDialog === 'edit' && active) {
        await updateZone({ id: active.id, ...input }).unwrap();
        toast({ tone: 'success', title: t('zone.updated', { zone: input.name }) });
      } else {
        const zone = await createZone(input).unwrap();
        setActiveId(zone.id);
        setDirty(false);
        toast({ tone: 'success', title: t('zone.created', { zone: zone.name }) });
      }
      setZoneDialog(null);
    } catch (err) {
      toast({ tone: 'error', title: t('zone.saveFailed'), description: errorMessage(err) ?? tc('tryAgain') });
    }
  };

  const removeZone = async () => {
    if (!active) return;
    try {
      await deleteZone(active.id).unwrap();
      toast({ title: t('zone.deleted', { zone: active.name }) });
      setActiveId(zones.find((z) => z.id !== active.id)?.id ?? null);
      setDirty(false);
    } catch (err) {
      toast({ tone: 'error', title: t('zone.deleteFailed'), description: errorMessage(err) ?? tc('tryAgain') });
    }
    setConfirmDelete(false);
  };

  if (!ready) return null;

  return (
    <PageContainer wide>
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        actions={
          <>
            <Link href="/admin/tables/qr" className={buttonClasses('secondary')}><QrCode size={16} aria-hidden /> {t('qrCodes')}</Link>
            <Button icon={Plus} variant="secondary" onClick={() => setZoneDialog('add')}>{t('zone.add')}</Button>
          </>
        }
      />

      {isLoading ? (
        <LoadingBlock label={t('loading')} />
      ) : !active ? (
        <EmptyState
          icon={LayoutGrid}
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          action={<Button icon={Plus} onClick={() => setZoneDialog('add')}>{t('zone.addFirst')}</Button>}
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div role="tablist" aria-label={t('zones')} className="flex flex-wrap gap-1 rounded-control border border-line bg-surface-muted p-0.5">
              {zones.map((z) => {
                const selected = z.id === active.id;
                return (
                  <button
                    key={z.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => switchTo(z.id)}
                    className={cn(
                      'h-8 rounded-[5px] px-3 text-sm font-medium transition-colors',
                      selected ? 'bg-surface text-fg shadow-soft' : 'text-fg-muted hover:text-fg',
                    )}
                  >
                    {z.name}
                    <span className="ml-1.5 text-xs font-normal text-fg-muted">{z.tables.length}</span>
                  </button>
                );
              })}
            </div>
            <IconButton icon={Pencil} label={t('zone.edit', { zone: active.name })} size="sm" onClick={() => setZoneDialog('edit')} />
            <IconButton icon={Trash2} label={t('zone.delete', { zone: active.name })} size="sm" onClick={() => setConfirmDelete(true)} />
          </div>

          <div role="tabpanel" aria-label={active.name}>
            <FloorEditor key={active.id} zone={active} otherLabels={otherLabels} onDirtyChange={onDirtyChange} />
          </div>
        </>
      )}

      <ZoneDialog
        open={zoneDialog !== null}
        zone={zoneDialog === 'edit' ? active : null}
        saving={creating || updating}
        onClose={() => setZoneDialog(null)}
        onSubmit={submitZone}
      />
      <ConfirmDialog
        open={pendingSwitch !== null}
        title={t('discardTitle')}
        description={t('discardDescription')}
        confirmLabel={t('discard')}
        danger
        onClose={() => setPendingSwitch(null)}
        onConfirm={() => { setDirty(false); setActiveId(pendingSwitch); setPendingSwitch(null); }}
      />
      <ConfirmDialog
        open={confirmDelete}
        title={t('zone.deleteTitle', { zone: active?.name ?? '' })}
        description={t('zone.deleteDescription', { count: active?.tables.length ?? 0 })}
        confirmLabel={t('zone.deleteConfirm')}
        danger
        busy={deleting}
        onClose={() => setConfirmDelete(false)}
        onConfirm={removeZone}
      />
    </PageContainer>
  );
}
