import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { AlertCircle, ChevronDown } from 'lucide-react';
import { cn, ICON_SM, ICON_STROKE } from './cn';

/* ---------------------------------------------------------------- Field -- */

interface FieldProps {
  label: ReactNode;
  /** id of the control inside; links the label, hint and error to it. */
  htmlFor: string;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Label + control + hint/error, with consistent spacing. */
export function Field({ label, htmlFor, required, hint, error, className, children }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-fg">
        {label}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="flex items-start gap-1.5 text-xs text-danger" role="alert">
          <AlertCircle size={14} strokeWidth={ICON_STROKE} className="mt-px shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** aria props for a control inside <Field>: pass the same id, error and hint. */
export function fieldAria(id: string, opts: { error?: unknown; hint?: unknown; required?: boolean }) {
  return {
    id,
    'aria-invalid': opts.error ? true : undefined,
    'aria-required': opts.required || undefined,
    'aria-describedby': opts.error ? `${id}-error` : opts.hint ? `${id}-hint` : undefined,
  } as const;
}

/* --------------------------------------------------------------- Controls -- */

const control =
  // Border is line-strong (≥ 3:1 against the surface) so inputs stay visible.
  'w-full rounded-control border border-line-strong bg-surface text-fg text-sm ' +
  'transition-[border-color,box-shadow] duration-150 ease-out ' +
  'hover:border-fg-muted ' +
  'focus:outline-none focus-visible:outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/20 ' +
  'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-muted disabled:opacity-80 ' +
  'aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/20';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(control, 'h-10 px-3', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 3, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cn(control, 'px-3 py-2 leading-relaxed', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <div className={cn('relative', className)}>
      <select ref={ref} className={cn(control, 'h-10 appearance-none pl-3 pr-9')} {...rest}>
        {children}
      </select>
      <ChevronDown
        size={ICON_SM}
        strokeWidth={ICON_STROKE}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle"
        aria-hidden
      />
    </div>
  );
});

/* ----------------------------------------------------------------- Switch -- */

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** Hide the visible label (still read by screen readers). */
  hideLabel?: boolean;
  disabled?: boolean;
  id?: string;
}

export function Switch({ checked, onChange, label, hideLabel, disabled, id }: SwitchProps) {
  return (
    <label className={cn('inline-flex items-center gap-2.5', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={hideLabel ? label : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-10 shrink-0 rounded-full border transition-colors duration-150 ease-out',
          checked ? 'border-accent bg-accent' : 'border-line-strong/70 bg-surface-muted',
        )}
      >
        <span
          className={cn(
            'absolute top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full shadow-soft transition-[left] duration-150 ease-out',
            checked ? 'left-[19px] bg-accent-fg' : 'left-[2px] bg-surface',
          )}
        />
      </button>
      {!hideLabel && <span className="text-sm text-fg">{label}</span>}
    </label>
  );
}

/** Classes for a native checkbox or radio so it uses the accent colour. */
export const checkboxClasses = 'h-4 w-4 rounded-[4px] border-line-strong accent-[rgb(var(--accent))]';
