import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn, ICON_STROKE } from './cn';

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

const tones: Record<Tone, { box: string; dot: string }> = {
  neutral: { box: 'bg-neutral-soft text-neutral', dot: 'bg-neutral' },
  accent: { box: 'bg-accent-soft text-accent', dot: 'bg-accent' },
  success: { box: 'bg-success-soft text-success', dot: 'bg-success' },
  warning: { box: 'bg-warning-soft text-warning', dot: 'bg-warning' },
  danger: { box: 'bg-danger-soft text-danger', dot: 'bg-danger' },
  info: { box: 'bg-info-soft text-info', dot: 'bg-info' },
};

interface BadgeProps {
  tone?: Tone;
  /** Coloured dot before the label — used for statuses. */
  dot?: boolean;
  icon?: LucideIcon;
  className?: string;
  children: ReactNode;
}

export default function Badge({ tone = 'neutral', dot, icon: Icon, className, children }: BadgeProps) {
  const t = tones[tone];
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium',
        t.box,
        className,
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', t.dot)} aria-hidden />}
      {Icon && <Icon size={13} strokeWidth={ICON_STROKE} aria-hidden />}
      {children}
    </span>
  );
}
