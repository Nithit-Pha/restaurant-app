import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2, type LucideIcon } from 'lucide-react';
import { cn, ICON_SM, ICON_STROKE } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium select-none ' +
  'rounded-control transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out ' +
  'active:translate-y-px disabled:pointer-events-none disabled:opacity-50';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover shadow-[inset_0_-1px_0_rgb(0_0_0/0.12)]',
  secondary: 'bg-surface text-fg border border-line-strong/60 hover:bg-surface-hover hover:border-line-strong',
  ghost: 'text-fg-muted hover:text-fg hover:bg-surface-hover',
  danger: 'bg-danger text-white dark:text-canvas hover:bg-danger-hover',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-base',
};

/** Classes for links that should look like buttons (e.g. <Link className={buttonClasses()}>). */
export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra?: string) {
  return cn(base, variants[variant], sizes[size], extra);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, keeps the label, and disables the button. */
  loading?: boolean;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  fullWidth?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon: Icon, iconRight: IconRight, fullWidth, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className)}
      {...rest}
    >
      {loading ? (
        <Loader2 size={ICON_SM} strokeWidth={ICON_STROKE} className="animate-spin" aria-hidden />
      ) : (
        Icon && <Icon size={ICON_SM} strokeWidth={ICON_STROKE} aria-hidden />
      )}
      {children}
      {IconRight && !loading && <IconRight size={ICON_SM} strokeWidth={ICON_STROKE} aria-hidden />}
    </button>
  );
});

export default Button;
