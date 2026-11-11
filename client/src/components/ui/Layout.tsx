import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn, ICON_SM, ICON_STROKE } from './cn';

/* ------------------------------------------------------------- PageHeader -- */

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Small text above the title, e.g. a section name. */
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-medium uppercase tracking-wide text-fg-muted">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Page width + padding. `wide` for staff tables. */
export function PageContainer({ wide, className, children }: { wide?: boolean; className?: string; children: ReactNode }) {
  return <div className={cn('mx-auto w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8', wide ? 'max-w-7xl' : 'max-w-5xl', className)}>{children}</div>;
}

/* ------------------------------------------------------- SegmentedControl -- */

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: LucideIcon;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}

/** 2–4 mutually exclusive choices shown together (Pickup / Delivery). */
export function SegmentedControl<T extends string>({ value, onChange, options, label, size = 'md', className }: SegmentedControlProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-control border border-line bg-surface-muted p-0.5', className)}>
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-2 rounded-[5px] font-medium transition-colors duration-150 ease-out',
              size === 'sm' ? 'h-7 px-3 text-xs' : 'h-9 px-4 text-sm',
              active ? 'bg-surface text-fg shadow-soft' : 'text-fg-muted hover:text-fg',
            )}
          >
            {Icon && <Icon size={ICON_SM} strokeWidth={ICON_STROKE} aria-hidden />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- Chips -- */

export interface ChipOption<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
  /** Colour of the count bubble when the chip is not selected. */
  emphasis?: boolean;
}

interface ChipGroupProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: ChipOption<T>[];
  label: string;
  className?: string;
}

/** Filter chips with counts (order status filter). */
export function ChipGroup<T extends string>({ value, onChange, options, label, className }: ChipGroupProps<T>) {
  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap gap-2', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors duration-150 ease-out',
              active
                ? 'border-accent bg-accent text-accent-fg'
                : 'border-line bg-surface text-fg-muted hover:border-line-strong hover:text-fg',
            )}
          >
            {o.label}
            {o.count != null && (
              <span
                className={cn(
                  'min-w-[1.25rem] rounded-full px-1.5 text-center text-xs tabular-nums leading-5',
                  active ? 'bg-accent-fg/20 text-accent-fg' : o.emphasis && o.count > 0 ? 'bg-warning-soft text-warning' : 'bg-surface-muted text-fg-muted',
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
