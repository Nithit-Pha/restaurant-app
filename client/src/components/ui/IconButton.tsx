import { forwardRef, type ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn, ICON_MD, ICON_SM, ICON_STROKE } from './cn';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: LucideIcon;
  /** Required: read by screen readers and shown as a tooltip. */
  label: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'ghost' | 'secondary' | 'primary';
  /** Small number shown on the corner (e.g. cart count). */
  count?: number;
}

const sizes = { sm: 'h-8 w-8', md: 'h-9 w-9', lg: 'h-10 w-10' };
const variants = {
  ghost: 'text-fg-muted hover:text-fg hover:bg-surface-hover',
  secondary: 'bg-surface text-fg border border-line-strong/60 hover:bg-surface-hover',
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
};

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, size = 'md', variant = 'ghost', count, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-control transition-colors duration-150 ease-out',
        'disabled:pointer-events-none disabled:opacity-50',
        sizes[size],
        variants[variant],
        className,
      )}
      {...rest}
    >
      <Icon size={size === 'sm' ? ICON_SM : ICON_MD} strokeWidth={ICON_STROKE} aria-hidden />
      {count != null && count > 0 && (
        <span className="absolute -right-1 -top-1 min-w-[1.125rem] rounded-full bg-accent px-1 text-center text-[11px] font-semibold leading-[1.125rem] text-accent-fg tabular-nums ring-2 ring-surface">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
});

export default IconButton;
