'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle, Circle, Copy, LayoutTemplate, RectangleHorizontal, Redo2, RotateCcw, RotateCw, Save, Square, Trash2, Undo2,
} from 'lucide-react';
import {
  useSaveZoneLayoutMutation, type DecorType, type FloorZone, type TableShape,
} from '../../../api/apiSlice';
import { Alert, Button, Card, CardBody, Field, IconButton, Input, Select, cn, useToast } from '../../../components/ui';
import FloorCanvas, { CELL, type CanvasTable } from './FloorCanvas';
import {
  DECOR_DEFAULTS, LABEL_MAX, SEATS_MAX, TABLE_DEFAULTS, TABLE_MAX_SIZE, ZONE_MAX,
  clampInside, findFreeSpot, findProblems, labelKey, newKey, nextLabel, nextRotation, overlappingTables,
  type EditorDecor, type EditorLayout, type EditorTable, type Problem,
} from './layoutRules';
import { useLayoutHistory } from './useLayoutHistory';
import { TemplatesDialog } from './ZoneDialogs';

const DECOR_TYPES: DecorType[] = ['WALL', 'BAR', 'ENTRANCE', 'PLANT', 'KITCHEN'];
const SHAPES: { shape: TableShape; icon: typeof Circle }[] = [
  { shape: 'ROUND', icon: Circle },
  { shape: 'SQUARE', icon: Square },
  { shape: 'RECT', icon: RectangleHorizontal },
];

type Kind = 'table' | 'decor';
type Selection = { kind: Kind; key: string } | null;

function fromZone(zone: FloorZone): EditorLayout {
  return {
    tables: zone.tables.map((t) => ({
      key: t.id, id: t.id, label: t.label, shape: t.shape, seats: t.seats,
      x: t.x, y: t.y, width: t.width, height: t.height, rotation: t.rotation,
    })),
    decor: (zone.decor ?? []).map((d, i) => ({ ...d, key: `decor-${i}` })),
  };
}

/** Layout without the editor-only keys, to compare with what is saved. */
const fingerprint = (l: EditorLayout) => JSON.stringify({
  tables: l.tables.map(({ key: _k, ...rest }) => rest),
  decor: l.decor.map(({ key: _k, ...rest }) => rest),
});

interface Drag {
  kind: Kind;
  key: string;
  mode: 'move' | 'resize';
  offX: number;
  offY: number;
}

interface Props {
  zone: FloorZone;
  /** Table names in the other zones (names are unique across the restaurant). */
  otherLabels: Set<string>;
  onDirtyChange: (dirty: boolean) => void;
}

export default function FloorEditor({ zone, otherLabels, onDirtyChange }: Props) {
  const t = useTranslations('floorPlan');
  const tc = useTranslations('common');
  const toast = useToast();
  const [saveLayout, { isLoading: saving }] = useSaveZoneLayoutMutation();

  const saved = useMemo(() => fromZone(zone), [zone]);
  const savedPrint = useMemo(() => fingerprint(saved), [saved]);
  const history = useLayoutHistory<EditorLayout>(saved);
  const layout = history.present;
  const [selection, setSelection] = useState<Selection>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);

  // A new saved version from the server (after Save) replaces the draft.
  useEffect(() => {
    history.reset(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPrint]);

  const dirty = fingerprint(layout) !== savedPrint;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const problems = useMemo(() => findProblems(layout, zone, otherLabels), [layout, zone, otherLabels]);
  const overlaps = useMemo(() => overlappingTables(layout.tables), [layout.tables]);
  const errorKeys = useMemo(() => new Set(problems.map((p) => p.key)), [problems]);
  const warningKeys = useMemo(() => new Set(overlaps.keys()), [overlaps]);

  const usedLabels = useMemo(() => {
    const s = new Set(otherLabels);
    layout.tables.forEach((tb) => s.add(labelKey(tb.label)));
    return s;
  }, [otherLabels, layout.tables]);

  const selectedTable = selection?.kind === 'table' ? layout.tables.find((x) => x.key === selection.key) : undefined;
  const selectedDecor = selection?.kind === 'decor' ? layout.decor.find((x) => x.key === selection.key) : undefined;

  // ---------------------------------------------------------------- changes --

  const withItem = useCallback(
    (l: EditorLayout, kind: Kind, key: string, change: (item: EditorTable | EditorDecor) => EditorTable | EditorDecor): EditorLayout =>
      kind === 'table'
        ? { ...l, tables: l.tables.map((x) => (x.key === key ? (change(x) as EditorTable) : x)) }
        : { ...l, decor: l.decor.map((x) => (x.key === key ? (change(x) as EditorDecor) : x)) },
    [],
  );

  const updateSelected = (change: Partial<EditorTable> | Partial<EditorDecor>) => {
    if (!selection) return;
    history.commit(withItem(layout, selection.kind, selection.key, (item) => clampInside({ ...item, ...change } as EditorTable, zone.width, zone.height)));
  };

  const allBoxes = () => [...layout.tables, ...layout.decor];

  const addTable = (shape: TableShape) => {
    const size = TABLE_DEFAULTS[shape];
    const spot = findFreeSpot(size, zone, allBoxes());
    if (!spot) {
      toast({ tone: 'error', title: t('noSpace'), description: t('noSpaceHint') });
      return;
    }
    const table: EditorTable = { key: newKey('table'), label: nextLabel(usedLabels), shape, seats: size.seats, width: size.width, height: size.height, ...spot, rotation: 0 };
    history.commit({ ...layout, tables: [...layout.tables, table] });
    setSelection({ kind: 'table', key: table.key });
  };

  const addDecor = (type: DecorType) => {
    const size = { width: Math.min(DECOR_DEFAULTS[type].width, zone.width), height: Math.min(DECOR_DEFAULTS[type].height, zone.height) };
    const spot = findFreeSpot(size, zone, allBoxes()) ?? { x: 0, y: 0 };
    const item: EditorDecor = { key: newKey('decor'), type, ...size, ...spot, rotation: 0 };
    history.commit({ ...layout, decor: [...layout.decor, item] });
    setSelection({ kind: 'decor', key: item.key });
  };

  const removeSelected = () => {
    if (!selection) return;
    history.commit(
      selection.kind === 'table'
        ? { ...layout, tables: layout.tables.filter((x) => x.key !== selection.key) }
        : { ...layout, decor: layout.decor.filter((x) => x.key !== selection.key) },
    );
    setSelection(null);
  };

  const duplicateSelected = () => {
    if (!selectedTable) return;
    const spot = findFreeSpot(selectedTable, zone, allBoxes());
    if (!spot) {
      toast({ tone: 'error', title: t('noSpace'), description: t('noSpaceHint') });
      return;
    }
    const { id: _id, ...rest } = selectedTable;
    const copy: EditorTable = { ...rest, key: newKey('table'), label: nextLabel(usedLabels), ...spot };
    history.commit({ ...layout, tables: [...layout.tables, copy] });
    setSelection({ kind: 'table', key: copy.key });
  };

  const changeShape = (shape: TableShape) => {
    if (!selectedTable) return;
    const square = shape !== 'RECT';
    const side = Math.max(selectedTable.width, selectedTable.height);
    updateSelected(square ? { shape, width: side, height: side } : { shape, width: Math.max(selectedTable.width, 3), height: Math.min(selectedTable.height, 2) });
  };

  // --------------------------------------------------------- drag & resize --

  const toCell = (e: PointerEvent) => {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal; // includes a small margin around the zone
    return {
      x: (((e.clientX - rect.left) / rect.width) * vb.width + vb.x) / CELL,
      y: (((e.clientY - rect.top) / rect.height) * vb.height + vb.y) / CELL,
    };
  };

  const findItem = (kind: Kind, key: string) =>
    (kind === 'table' ? layout.tables.find((x) => x.key === key) : layout.decor.find((x) => x.key === key))!;

  const startDrag = (e: PointerEvent, kind: Kind, key: string, mode: Drag['mode']) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation(); // the canvas background clears the selection
    setSelection({ kind, key });
    const item = findItem(kind, key);
    const p = toCell(e);
    drag.current = { kind, key, mode, offX: p.x - item.x, offY: p.y - item.y };
    svgRef.current?.setPointerCapture(e.pointerId);
    history.begin();
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const item = findItem(d.kind, d.key);
    if (!item) return;
    const p = toCell(e);
    let next: EditorTable | EditorDecor;
    if (d.mode === 'move') {
      next = clampInside({ ...item, x: Math.round(p.x - d.offX), y: Math.round(p.y - d.offY) }, zone.width, zone.height);
    } else {
      const max = d.kind === 'table' ? TABLE_MAX_SIZE : ZONE_MAX;
      let w = Math.min(Math.max(Math.round(p.x - item.x), 1), max, zone.width - item.x);
      let h = Math.min(Math.max(Math.round(p.y - item.y), 1), max, zone.height - item.y);
      if (d.kind === 'table' && (item as EditorTable).shape !== 'RECT') w = h = Math.max(w, h);
      next = { ...item, width: w, height: h };
    }
    if (next.x !== item.x || next.y !== item.y || next.width !== item.width || next.height !== item.height) {
      history.preview(withItem(layout, d.kind, d.key, () => next));
    }
  };

  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    history.end();
  };

  const onItemKeyDown = (e: KeyboardEvent, kind: Kind, key: string) => {
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      history.commit(withItem(layout, kind, key, (item) => clampInside({ ...item, x: item.x + dx, y: item.y + dy }, zone.width, zone.height)));
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeSelected();
    } else if (e.key === 'Escape') {
      setSelection(null);
      (e.target as SVGElement).blur?.();
    }
  };

  // Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z / Ctrl+Y, unless typing in a field.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select')) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); history.undo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); history.redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history.undo, history.redo]);

  // ------------------------------------------------------------------ save --

  const save = async () => {
    try {
      await saveLayout({
        id: zone.id,
        tables: layout.tables.map(({ key: _k, ...tb }) => tb),
        decor: layout.decor.map(({ key: _k, ...d }) => d),
      }).unwrap();
      setSelection(null);
      toast({ tone: 'success', title: t('saved', { zone: zone.name }) });
    } catch (err) {
      const message = (err as { data?: { message?: string } })?.data?.message;
      toast({ tone: 'error', title: t('saveFailed'), description: message ?? tc('tryAgain') });
    }
  };

  const applyTemplate = (next: EditorLayout, placed: number, wanted: number) => {
    history.commit(next);
    setSelection(null);
    setTemplatesOpen(false);
    toast({ title: placed < wanted ? t('templatePartly', { placed, wanted }) : t('templateApplied') });
  };

  // ------------------------------------------------------------------ view --

  const tableLabel = (tb: CanvasTable) => t('tableAria', { label: tb.label, seats: tb.seats });
  const decorLabel = (type: DecorType) => t(`decor.${type}`);
  const totalSeats = layout.tables.reduce((s, x) => s + x.seats, 0);
  const problemText = (p: Problem) => {
    const name = p.kind === 'table' ? layout.tables.find((x) => x.key === p.key)?.label || '?' : t(`decor.${layout.decor.find((x) => x.key === p.key)?.type ?? 'WALL'}`);
    return t(`problem.${p.code}`, { name });
  };

  return (
    <div className="flex flex-col gap-4 xl:flex-row">
      <div className="min-w-0 flex-1">
        {/* Toolbar */}
        <div className="mb-3 flex flex-wrap items-center gap-2" role="toolbar" aria-label={t('toolbar')}>
          {SHAPES.map(({ shape, icon }) => (
            <Button key={shape} size="sm" variant="secondary" icon={icon} onClick={() => addTable(shape)}>
              {t(`add.${shape}`)}
            </Button>
          ))}
          <Select
            aria-label={t('addDecor')}
            value=""
            onChange={(e) => e.target.value && addDecor(e.target.value as DecorType)}
            className="w-40 [&_select]:h-8 [&_select]:text-sm"
          >
            <option value="">{t('addDecor')}</option>
            {DECOR_TYPES.map((d) => <option key={d} value={d}>{t(`decor.${d}`)}</option>)}
          </Select>
          <Button size="sm" variant="ghost" icon={LayoutTemplate} onClick={() => setTemplatesOpen(true)}>{t('templates')}</Button>
          <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden />
          <IconButton icon={Undo2} label={t('undo')} size="sm" onClick={history.undo} disabled={!history.canUndo} />
          <IconButton icon={Redo2} label={t('redo')} size="sm" onClick={history.redo} disabled={!history.canRedo} />
          <IconButton icon={RotateCcw} label={t('reset')} size="sm" onClick={() => { history.commit(saved); setSelection(null); }} disabled={!dirty} />
          <div className="ml-auto flex items-center gap-3">
            {dirty && <span className="text-xs text-fg-muted">{t('unsaved')}</span>}
            <Button size="sm" icon={Save} onClick={save} loading={saving} disabled={!dirty || problems.length > 0}>
              {t('save')}
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-card border border-line bg-surface p-2">
          <FloorCanvas
            ref={svgRef}
            zone={zone}
            tables={layout.tables}
            decor={layout.decor}
            selectedKey={selection?.key}
            errorKeys={errorKeys}
            warningKeys={warningKeys}
            tableLabel={tableLabel}
            decorLabel={decorLabel}
            className="block h-auto w-full select-none"
            onItemPointerDown={(e, kind, key) => startDrag(e, kind, key, 'move')}
            onResizePointerDown={(e, kind, key) => startDrag(e, kind, key, 'resize')}
            onItemKeyDown={onItemKeyDown}
            onItemFocus={(kind, key) => setSelection({ kind, key })}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onPointerDown={() => setSelection(null)}
          />
        </div>
        <p className="mt-2 text-xs text-fg-muted">{t('canvasHint', { width: zone.width, height: zone.height })}</p>
      </div>

      {/* Side panel */}
      <Card className="w-full shrink-0 self-start xl:w-80">
        <CardBody className="flex flex-col gap-4">
          {selectedTable ? (
            <>
              <h2 className="text-base font-semibold text-fg">{t('tableTitle', { label: selectedTable.label || '?' })}</h2>
              <Field label={t('label')} htmlFor="fp-label" hint={t('labelHint')}>
                <Input
                  id="fp-label"
                  value={selectedTable.label}
                  maxLength={LABEL_MAX}
                  onChange={(e) => updateSelected({ label: e.target.value })}
                />
              </Field>
              <Field label={t('shape')} htmlFor="fp-shape">
                <Select id="fp-shape" value={selectedTable.shape} onChange={(e) => changeShape(e.target.value as TableShape)}>
                  {SHAPES.map(({ shape }) => <option key={shape} value={shape}>{t(`shapeName.${shape}`)}</option>)}
                </Select>
              </Field>
              <Field label={t('seats')} htmlFor="fp-seats">
                <Input
                  id="fp-seats"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={SEATS_MAX}
                  value={selectedTable.seats}
                  onChange={(e) => updateSelected({ seats: Math.max(1, Math.min(SEATS_MAX, Number(e.target.value) || 1)) })}
                />
              </Field>
              <SizeFields
                square={selectedTable.shape !== 'RECT'}
                width={selectedTable.width}
                height={selectedTable.height}
                max={TABLE_MAX_SIZE}
                onChange={(width, height) => updateSelected({ width, height })}
              />
              <ItemActions
                onRotate={() => updateSelected({ rotation: nextRotation(selectedTable.rotation) })}
                rotation={selectedTable.rotation}
                onDuplicate={duplicateSelected}
                onDelete={removeSelected}
              />
              {overlaps.get(selectedTable.key) && (
                <Alert tone="warning">{t('overlapsWith', { labels: overlaps.get(selectedTable.key)!.join(', ') })}</Alert>
              )}
            </>
          ) : selectedDecor ? (
            <>
              <h2 className="text-base font-semibold text-fg">{t(`decor.${selectedDecor.type}`)}</h2>
              <SizeFields
                square={selectedDecor.type === 'PLANT'}
                width={selectedDecor.width}
                height={selectedDecor.height}
                max={ZONE_MAX}
                onChange={(width, height) => updateSelected({ width, height })}
              />
              <ItemActions
                onRotate={() => updateSelected({ rotation: nextRotation(selectedDecor.rotation) })}
                rotation={selectedDecor.rotation}
                onDelete={removeSelected}
              />
            </>
          ) : (
            <>
              <h2 className="text-base font-semibold text-fg">{zone.name}</h2>
              <p className="text-sm text-fg-muted">
                {t('summary', { tables: layout.tables.length, seats: totalSeats })}
              </p>
              <p className="text-sm text-fg-muted">{t('help')}</p>
            </>
          )}

          {problems.length > 0 && (
            <div role="status" className="rounded-control border border-danger/40 bg-danger-soft/40 p-3 text-sm">
              <p className="mb-1 flex items-center gap-1.5 font-medium text-danger">
                <AlertTriangle size={16} aria-hidden /> {t('problemsTitle')}
              </p>
              <ul className="list-disc space-y-0.5 pl-5 text-fg">
                {problems.slice(0, 6).map((p, i) => (
                  <li key={`${p.key}-${p.code}-${i}`}>
                    <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => setSelection({ kind: p.kind, key: p.key })}>
                      {problemText(p)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardBody>
      </Card>

      <TemplatesDialog
        open={templatesOpen}
        zone={zone}
        usedLabels={otherLabels}
        hasItems={layout.tables.length + layout.decor.length > 0}
        onClose={() => setTemplatesOpen(false)}
        onApply={applyTemplate}
      />
    </div>
  );
}

function SizeFields({ square, width, height, max, onChange }: {
  square: boolean; width: number; height: number; max: number; onChange: (w: number, h: number) => void;
}) {
  const t = useTranslations('floorPlan');
  const clamp = (v: string) => Math.max(1, Math.min(max, Math.round(Number(v)) || 1));
  if (square) {
    return (
      <Field label={t('size')} htmlFor="fp-size" hint={t('sizeHint')}>
        <Input id="fp-size" type="number" inputMode="numeric" min={1} max={max} value={width}
          onChange={(e) => { const v = clamp(e.target.value); onChange(v, v); }} />
      </Field>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label={t('width')} htmlFor="fp-w">
        <Input id="fp-w" type="number" inputMode="numeric" min={1} max={max} value={width} onChange={(e) => onChange(clamp(e.target.value), height)} />
      </Field>
      <Field label={t('depth')} htmlFor="fp-h">
        <Input id="fp-h" type="number" inputMode="numeric" min={1} max={max} value={height} onChange={(e) => onChange(width, clamp(e.target.value))} />
      </Field>
      <p className="col-span-2 -mt-1 text-xs text-fg-muted">{t('sizeHint')}</p>
    </div>
  );
}

function ItemActions({ onRotate, rotation, onDuplicate, onDelete }: {
  onRotate: () => void; rotation: number; onDuplicate?: () => void; onDelete: () => void;
}) {
  const t = useTranslations('floorPlan');
  return (
    <div className={cn('flex flex-wrap gap-2')}>
      <Button size="sm" variant="secondary" icon={RotateCw} onClick={onRotate}>{t('rotate', { degrees: rotation })}</Button>
      {onDuplicate && <Button size="sm" variant="secondary" icon={Copy} onClick={onDuplicate}>{t('duplicate')}</Button>}
      <Button size="sm" variant="ghost" icon={Trash2} onClick={onDelete} className="text-danger hover:text-danger">{t('delete')}</Button>
    </div>
  );
}
