import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from './cn';

/** Scroll container + table. Use inside a Card or on its own. */
export function Table({ className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm', className)} {...rest} />
    </div>
  );
}

export function THead({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('border-b border-line bg-surface-muted/60 text-left', className)} {...rest} />;
}

export function TBody({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-line', className)} {...rest} />;
}

interface THProps extends ThHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
}

export function TH({ numeric, className, ...rest }: THProps) {
  return (
    <th
      scope="col"
      className={cn(
        'h-10 whitespace-nowrap px-4 text-xs font-medium uppercase tracking-wide text-fg-muted',
        numeric && 'text-right',
        className,
      )}
      {...rest}
    />
  );
}

interface TRProps extends HTMLAttributes<HTMLTableRowElement> {
  /** Hover + pointer: the row opens something. */
  interactive?: boolean;
  selected?: boolean;
}

export function TR({ interactive, selected, className, ...rest }: TRProps) {
  return (
    <tr
      aria-selected={selected || undefined}
      className={cn(
        'transition-colors duration-100',
        interactive && 'cursor-pointer hover:bg-surface-hover',
        selected && 'bg-accent-soft/50 hover:bg-accent-soft/70',
        className,
      )}
      {...rest}
    />
  );
}

interface TDProps extends TdHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
  muted?: boolean;
}

export function TD({ numeric, muted, className, ...rest }: TDProps) {
  return (
    <td
      className={cn(
        'h-12 px-4 align-middle',
        numeric && 'whitespace-nowrap text-right tabular-nums',
        muted ? 'text-fg-muted' : 'text-fg',
        className,
      )}
      {...rest}
    />
  );
}
