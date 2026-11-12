'use client';

import { forwardRef, useId, type KeyboardEvent, type PointerEvent, type SVGProps } from 'react';
import type { DecorType, TableShape } from '../../../api/apiSlice';
import type { Box } from './layoutRules';

/** Size of one grid cell in SVG units. */
export const CELL = 40;

const c = (name: string, alpha?: number) => (alpha === undefined ? `rgb(var(--${name}))` : `rgb(var(--${name}) / ${alpha})`);

export interface CanvasTable extends Box {
  key: string;
  label: string;
  shape: TableShape;
  seats: number;
}

export interface CanvasDecor extends Box {
  key: string;
  type: DecorType;
}

type ItemKind = 'table' | 'decor';

export interface FloorCanvasProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  zone: { width: number; height: number; name: string };
  tables: CanvasTable[];
  decor: CanvasDecor[];
  selectedKey?: string | null;
  /** Red outline: something blocks saving. */
  errorKeys?: Set<string>;
  /** Orange outline: a warning, e.g. overlapping tables. */
  warningKeys?: Set<string>;
  /** Fill of a table, e.g. by live status on the floor view. */
  tableFill?: (t: CanvasTable) => string | undefined;
  tableLabel: (t: CanvasTable) => string;
  decorLabel: (type: DecorType) => string;
  onItemPointerDown?: (e: PointerEvent<SVGGElement>, kind: ItemKind, key: string) => void;
  onItemKeyDown?: (e: KeyboardEvent<SVGGElement>, kind: ItemKind, key: string) => void;
  onItemFocus?: (kind: ItemKind, key: string) => void;
  /** Shows a resize handle on the selected, unturned item. */
  onResizePointerDown?: (e: PointerEvent<SVGRectElement>, kind: ItemKind, key: string) => void;
}

/** Spread `seats` chairs over the four sides of a rectangle, in proportion to their length. */
function chairsOnSides(seats: number, w: number, h: number): [number, number, number, number] {
  const sides = [w, w, h, h]; // top, bottom, left, right
  const perimeter = 2 * (w + h);
  const exact = sides.map((s) => (seats * s) / perimeter);
  const counts = exact.map(Math.floor);
  let left = seats - counts.reduce((a, b) => a + b, 0);
  const order = exact.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left-- <= 0) break;
    counts[i]++;
  }
  return counts as [number, number, number, number];
}

function TableGlyph({ t, fill }: { t: CanvasTable; fill?: string }) {
  const x = t.x * CELL;
  const y = t.y * CELL;
  const w = t.width * CELL;
  const h = t.height * CELL;
  const inset = CELL * 0.4;
  const chairR = CELL * 0.15;
  const chairs: [number, number][] = [];

  if (t.shape === 'ROUND') {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const ring = Math.min(w, h) / 2 - CELL * 0.2;
    for (let i = 0; i < t.seats; i++) {
      const a = (i / t.seats) * Math.PI * 2 - Math.PI / 2;
      chairs.push([cx + Math.cos(a) * ring, cy + Math.sin(a) * ring]);
    }
  } else {
    const [top, bottom, left, right] = chairsOnSides(t.seats, t.width, t.height);
    const along = (n: number, from: number, len: number) => Array.from({ length: n }, (_, i) => from + ((i + 0.5) * len) / n);
    along(top, x + inset, w - 2 * inset).forEach((cx) => chairs.push([cx, y + CELL * 0.2]));
    along(bottom, x + inset, w - 2 * inset).forEach((cx) => chairs.push([cx, y + h - CELL * 0.2]));
    along(left, y + inset, h - 2 * inset).forEach((cy) => chairs.push([x + CELL * 0.2, cy]));
    along(right, y + inset, h - 2 * inset).forEach((cy) => chairs.push([x + w - CELL * 0.2, cy]));
  }

  const body = fill ?? c('surface');
  const fontSize = Math.min(CELL * 0.45, (Math.min(w, h) - 2 * inset) * 0.42);
  return (
    <>
      {chairs.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={chairR} fill={c('surface-muted')} stroke={c('line-strong')} strokeWidth={1} />
      ))}
      {t.shape === 'ROUND' ? (
        <circle cx={x + w / 2} cy={y + h / 2} r={Math.min(w, h) / 2 - inset} fill={body} stroke={c('line-strong')} strokeWidth={1.5} />
      ) : (
        <rect x={x + inset} y={y + inset} width={w - 2 * inset} height={h - 2 * inset} rx={6} fill={body} stroke={c('line-strong')} strokeWidth={1.5} />
      )}
      <text
        x={x + w / 2}
        y={y + h / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSize}
        fontWeight={600}
        fill={c('fg')}
        // Text stays upright when the table is turned.
        transform={t.rotation ? `rotate(${-t.rotation} ${x + w / 2} ${y + h / 2})` : undefined}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {t.label}
      </text>
    </>
  );
}

function DecorGlyph({ d, label, hatch }: { d: CanvasDecor; label: string; hatch: string }) {
  const x = d.x * CELL;
  const y = d.y * CELL;
  const w = d.width * CELL;
  const h = d.height * CELL;
  const text = (
    <text
      x={x + w / 2}
      y={y + h / 2}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={Math.min(CELL * 0.36, h * 0.5)}
      fill={c('fg-muted')}
      transform={d.rotation ? `rotate(${-d.rotation} ${x + w / 2} ${y + h / 2})` : undefined}
      style={{ pointerEvents: 'none', userSelect: 'none' }}
    >
      {label}
    </text>
  );
  switch (d.type) {
    case 'WALL':
      return <rect x={x} y={y + h * 0.15} width={w} height={h * 0.7} rx={2} fill={c('fg-muted')} />;
    case 'PLANT':
      return <circle cx={x + w / 2} cy={y + h / 2} r={Math.min(w, h) / 2 - 3} fill={c('success-soft')} stroke={c('success')} strokeWidth={1.5} />;
    case 'BAR':
      return (
        <>
          <rect x={x + 2} y={y + 2} width={w - 4} height={h - 4} rx={4} fill={c('warning-soft')} stroke={c('warning')} strokeWidth={1.5} />
          {w >= CELL * 2 && text}
        </>
      );
    case 'ENTRANCE':
      return (
        <>
          <rect x={x + 2} y={y + 2} width={w - 4} height={h - 4} rx={4} fill={c('info-soft', 0.6)} stroke={c('info')} strokeWidth={1.5} strokeDasharray="6 4" />
          {w >= CELL * 2 && text}
        </>
      );
    case 'STAIRS': {
      // Steps across the short side, with an arrow pointing up the stairs (towards the top).
      const vertical = h >= w;
      const len = vertical ? h : w;
      const steps = Math.max(3, Math.round(len / (CELL * 0.35)));
      const lines = Array.from({ length: steps - 1 }, (_, i) => {
        const p = ((i + 1) / steps) * len;
        return vertical
          ? <line key={i} x1={x + 3} y1={y + p} x2={x + w - 3} y2={y + p} stroke={c('line-strong')} strokeWidth={1} />
          : <line key={i} x1={x + p} y1={y + 3} x2={x + p} y2={y + h - 3} stroke={c('line-strong')} strokeWidth={1} />;
      });
      const cx = x + w / 2;
      const cy = y + h / 2;
      const a = Math.min(w, h) * 0.3;
      const arrow = vertical
        ? `M ${cx} ${y + h - 6} L ${cx} ${y + 6} M ${cx - a / 2} ${y + 6 + a / 2} L ${cx} ${y + 6} L ${cx + a / 2} ${y + 6 + a / 2}`
        : `M ${x + 6} ${cy} L ${x + w - 6} ${cy} M ${x + w - 6 - a / 2} ${cy - a / 2} L ${x + w - 6} ${cy} L ${x + w - 6 - a / 2} ${cy + a / 2}`;
      return (
        <>
          <rect x={x + 2} y={y + 2} width={w - 4} height={h - 4} rx={3} fill={c('surface-muted')} stroke={c('line-strong')} strokeWidth={1.5} />
          {lines}
          <path d={arrow} fill="none" stroke={c('fg-muted')} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <title>{label}</title>
        </>
      );
    }
    case 'KITCHEN':
      return (
        <>
          <rect x={x + 2} y={y + 2} width={w - 4} height={h - 4} rx={4} fill={`url(#${hatch})`} stroke={c('line-strong')} strokeWidth={1.5} />
          {w >= CELL * 2 && text}
        </>
      );
  }
}

/** Draws a zone: the grid, decor and tables. Used by the editor and, later, the live floor view. */
const FloorCanvas = forwardRef<SVGSVGElement, FloorCanvasProps>(function FloorCanvas(
  {
    zone, tables, decor, selectedKey, errorKeys, warningKeys, tableFill, tableLabel, decorLabel,
    onItemPointerDown, onItemKeyDown, onItemFocus, onResizePointerDown, className, ...svgProps
  },
  ref,
) {
  // Several canvases can be on one page (editor + template previews): unique pattern ids.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const W = zone.width * CELL;
  const H = zone.height * CELL;
  const interactive = Boolean(onItemPointerDown || onItemKeyDown);

  const frame = (kind: ItemKind, item: Box & { key: string }) => {
    const selected = item.key === selectedKey;
    const error = errorKeys?.has(item.key);
    const warning = warningKeys?.has(item.key);
    if (!selected && !error && !warning) return null;
    const stroke = error ? c('danger') : selected ? c('accent') : c('warning');
    return (
      <>
        <rect
          x={item.x * CELL - 3}
          y={item.y * CELL - 3}
          width={item.width * CELL + 6}
          height={item.height * CELL + 6}
          rx={6}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          strokeDasharray={selected && !error ? '6 4' : undefined}
          style={{ pointerEvents: 'none' }}
        />
        {selected && item.rotation === 0 && onResizePointerDown && (
          <rect
            x={(item.x + item.width) * CELL - 9}
            y={(item.y + item.height) * CELL - 9}
            width={14}
            height={14}
            rx={3}
            fill={c('accent')}
            stroke={c('surface')}
            strokeWidth={2}
            style={{ cursor: 'nwse-resize', touchAction: 'none' }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onResizePointerDown(e, kind, item.key);
            }}
          />
        )}
      </>
    );
  };

  const groupProps = (kind: ItemKind, item: Box & { key: string }, label: string) => ({
    transform: item.rotation ? `rotate(${item.rotation} ${(item.x + item.width / 2) * CELL} ${(item.y + item.height / 2) * CELL})` : undefined,
    ...(interactive
      ? {
          tabIndex: 0,
          role: 'button',
          'aria-label': label,
          'aria-pressed': item.key === selectedKey,
          style: { cursor: 'grab', touchAction: 'none', outline: 'none' } as const,
          onPointerDown: (e: PointerEvent<SVGGElement>) => onItemPointerDown?.(e, kind, item.key),
          onKeyDown: (e: KeyboardEvent<SVGGElement>) => onItemKeyDown?.(e, kind, item.key),
          onFocus: () => onItemFocus?.(kind, item.key),
        }
      : { 'aria-label': label, role: 'img' }),
  });

  return (
    <svg
      ref={ref}
      viewBox={`-6 -6 ${W + 12} ${H + 12}`}
      className={className}
      role="group"
      aria-label={zone.name}
      {...svgProps}
    >
      <defs>
        <pattern id={`${uid}-grid`} width={CELL} height={CELL} patternUnits="userSpaceOnUse">
          <path d={`M ${CELL} 0 L 0 0 0 ${CELL}`} fill="none" stroke={c('line')} strokeWidth={1} />
        </pattern>
        <pattern id={`${uid}-hatch`} width={10} height={10} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={10} height={10} fill={c('surface-muted')} />
          <line x1={0} y1={0} x2={0} y2={10} stroke={c('line-strong', 0.5)} strokeWidth={2} />
        </pattern>
      </defs>
      <rect x={0} y={0} width={W} height={H} fill={c('canvas')} />
      <rect x={0} y={0} width={W} height={H} fill={`url(#${uid}-grid)`} />
      <rect x={0} y={0} width={W} height={H} fill="none" stroke={c('line-strong')} strokeWidth={1.5} />

      {decor.map((d) => (
        <g key={d.key}>
          <g {...groupProps('decor', d, decorLabel(d.type))}>
            <DecorGlyph d={d} label={decorLabel(d.type)} hatch={`${uid}-hatch`} />
            {frame('decor', d)}
          </g>
        </g>
      ))}
      {tables.map((t) => (
        <g key={t.key}>
          <g {...groupProps('table', t, tableLabel(t))}>
            <TableGlyph t={t} fill={tableFill?.(t)} />
            {frame('table', t)}
          </g>
        </g>
      ))}
    </svg>
  );
});

export default FloorCanvas;
