import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, type LucideIcon } from 'lucide-react';
import { cn, ICON_MD, ICON_STROKE } from './cn';

/* ---------------------------------------------------------------- Spinner -- */

export function Spinner({ label, size = ICON_MD, className }: { label?: string; size?: number; className?: string }) {
  const t = useTranslations('common');
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-fg-muted', className)}>
      <Loader2 size={size} strokeWidth={ICON_STROKE} className="animate-spin" aria-hidden />
      <span className="sr-only">{label ?? t('loading')}</span>
    </span>
  );
}

/** Centered spinner with a line of text, for a whole section that is loading. */
export function LoadingBlock({ label, className }: { label?: string; className?: string }) {
  const t = useTranslations('common');
  return (
    <div role="status" className={cn('flex items-center justify-center gap-2 py-16 text-sm text-fg-muted', className)}>
      <Loader2 size={ICON_MD} strokeWidth={ICON_STROKE} className="animate-spin" aria-hidden />
      {label ?? t('loadingDots')}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-control bg-surface-muted', className)} aria-hidden />;
}

/* ------------------------------------------------------------- EmptyState -- */

interface EmptyStateProps {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      {Icon && (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-surface-muted text-fg-muted">
          <Icon size={ICON_MD} strokeWidth={ICON_STROKE} aria-hidden />
        </div>
      )}
      <p className="text-base font-medium text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ Alert -- */

type AlertTone = 'info' | 'success' | 'warning' | 'danger';
const alertStyle: Record<AlertTone, { box: string; icon: LucideIcon }> = {
  info: { box: 'border-info/25 bg-info-soft text-info', icon: Info },
  success: { box: 'border-success/25 bg-success-soft text-success', icon: CheckCircle2 },
  warning: { box: 'border-warning/25 bg-warning-soft text-warning', icon: AlertTriangle },
  danger: { box: 'border-danger/25 bg-danger-soft text-danger', icon: AlertCircle },
};

/** Inline message inside a page or form (errors, notices, the "closed now" banner). */
export function Alert({ tone = 'info', title, children, action, className }: { tone?: AlertTone; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  const s = alertStyle[tone];
  const Icon = s.icon;
  return (
    <div role={tone === 'danger' ? 'alert' : undefined} className={cn('flex items-start gap-3 rounded-card border px-4 py-3 text-sm', s.box, className)}>
      <Icon size={ICON_MD} strokeWidth={ICON_STROKE} className="mt-px shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(Boolean(title) && 'mt-0.5', 'text-fg')}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
