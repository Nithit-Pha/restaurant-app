'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { FloorZone, ZoneInput } from '../../../api/apiSlice';
import { Button, Dialog, Field, Input, cn } from '../../../components/ui';
import FloorCanvas from './FloorCanvas';
import type { EditorLayout } from './layoutRules';
import { ZONE_MAX, ZONE_MIN } from './layoutRules';
import { buildTemplate, TEMPLATES, type TemplateId } from './templates';

/** Add a zone, or rename / resize one. */
export function ZoneDialog({ open, zone, saving, onClose, onSubmit }: {
  open: boolean;
  zone?: FloorZone | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (input: ZoneInput) => void;
}) {
  const t = useTranslations('floorPlan');
  const tc = useTranslations('common');
  const [name, setName] = useState('');
  const [width, setWidth] = useState('16');
  const [height, setHeight] = useState('10');

  useEffect(() => {
    if (!open) return;
    setName(zone?.name ?? '');
    setWidth(String(zone?.width ?? 16));
    setHeight(String(zone?.height ?? 10));
  }, [open, zone]);

  const w = Number(width);
  const h = Number(height);
  const sizeOk = (v: number) => Number.isInteger(v) && v >= ZONE_MIN && v <= ZONE_MAX;
  const valid = name.trim().length > 0 && sizeOk(w) && sizeOk(h);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissOnBackdrop={false}
      title={zone ? t('zone.editTitle') : t('zone.addTitle')}
      description={t('zone.description')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{tc('cancel')}</Button>
          <Button loading={saving} disabled={!valid} onClick={() => onSubmit({ name: name.trim(), width: w, height: h })}>
            {zone ? tc('save') : t('zone.add')}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => { e.preventDefault(); if (valid) onSubmit({ name: name.trim(), width: w, height: h }); }}
      >
        <Field label={t('zone.name')} htmlFor="zone-name" required>
          <Input id="zone-name" value={name} maxLength={40} placeholder={t('zone.namePlaceholder')} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('zone.width')} htmlFor="zone-w" error={width && !sizeOk(w) ? t('zone.sizeRange', { min: ZONE_MIN, max: ZONE_MAX }) : undefined}>
            <Input id="zone-w" type="number" inputMode="numeric" min={ZONE_MIN} max={ZONE_MAX} value={width} onChange={(e) => setWidth(e.target.value)} />
          </Field>
          <Field label={t('zone.depth')} htmlFor="zone-h" error={height && !sizeOk(h) ? t('zone.sizeRange', { min: ZONE_MIN, max: ZONE_MAX }) : undefined}>
            <Input id="zone-h" type="number" inputMode="numeric" min={ZONE_MIN} max={ZONE_MAX} value={height} onChange={(e) => setHeight(e.target.value)} />
          </Field>
        </div>
        <p className="text-xs text-fg-muted">{t('zone.sizeHint')}</p>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

/** Ask before a step that throws away unsaved changes or deletes a zone. */
export function ConfirmDialog({ open, title, description, confirmLabel, danger, busy, onClose, onConfirm }: {
  open: boolean; title: string; description: string; confirmLabel: string; danger?: boolean; busy?: boolean;
  onClose: () => void; onConfirm: () => void;
}) {
  const tc = useTranslations('common');
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{tc('cancel')}</Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    />
  );
}

/** Pick a starter layout; shows a small preview of each for this zone's size. */
export function TemplatesDialog({ open, zone, usedLabels, hasItems, onClose, onApply }: {
  open: boolean;
  zone: FloorZone;
  usedLabels: Set<string>;
  hasItems: boolean;
  onClose: () => void;
  onApply: (layout: EditorLayout, placed: number, wanted: number) => void;
}) {
  const t = useTranslations('floorPlan');
  const tc = useTranslations('common');
  const [choice, setChoice] = useState<TemplateId>('FOUR_TOPS');
  const [previews, setPreviews] = useState<Record<TemplateId, { layout: EditorLayout; wanted: number }> | null>(null);

  useEffect(() => {
    if (!open) return;
    setPreviews(Object.fromEntries(TEMPLATES.map((id) => [id, buildTemplate(id, zone, usedLabels)])) as Record<TemplateId, { layout: EditorLayout; wanted: number }>);
  }, [open, zone, usedLabels]);

  const picked = previews?.[choice];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={t('templatesTitle')}
      description={hasItems ? t('templatesReplace') : t('templatesDescription')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{tc('cancel')}</Button>
          <Button disabled={!picked} onClick={() => picked && onApply(picked.layout, picked.layout.tables.length, picked.wanted)}>
            {t('useTemplate')}
          </Button>
        </>
      }
    >
      <div role="radiogroup" aria-label={t('templatesTitle')} className="grid gap-3 sm:grid-cols-3">
        {TEMPLATES.map((id) => {
          const preview = previews?.[id];
          const active = id === choice;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setChoice(id)}
              className={cn(
                'flex flex-col gap-2 rounded-card border p-2 text-left transition-colors',
                active ? 'border-accent bg-accent-soft/50' : 'border-line hover:bg-surface-hover',
              )}
            >
              {preview && (
                <FloorCanvas
                  zone={zone}
                  tables={preview.layout.tables}
                  decor={preview.layout.decor}
                  tableLabel={(tb) => tb.label}
                  decorLabel={(type) => t(`decor.${type}`)}
                  className="pointer-events-none block h-auto w-full"
                  aria-hidden
                />
              )}
              <span className="px-1 text-sm font-medium text-fg">{t(`template.${id}`)}</span>
              {preview && (
                <span className="px-1 text-xs text-fg-muted">
                  {t('summary', { tables: preview.layout.tables.length, seats: preview.layout.tables.reduce((s, x) => s + x.seats, 0) })}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
