import { useTranslations } from 'next-intl';
import { cn } from '../../components/ui';

/**
 * The chosen options and the kitchen note under an order or cart line:
 * "Large · Extra egg" and "Note: no peanuts". Renders nothing when there are none.
 */
export default function LineDetails({ options = [], note, className, strongNote }: {
  options?: { name: string }[];
  note?: string | null;
  className?: string;
  /** Make the note stand out (kitchen screen). */
  strongNote?: boolean;
}) {
  const t = useTranslations('order');
  if (options.length === 0 && !note) return null;
  return (
    <div className={cn('text-xs text-fg-muted', className)}>
      {options.length > 0 && <p>{options.map((o) => o.name).join(' · ')}</p>}
      {note && (
        <p className={cn(strongNote && 'font-medium text-warning')}>
          {t('note', { note })}
        </p>
      )}
    </div>
  );
}
