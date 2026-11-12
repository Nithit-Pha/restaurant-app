'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Bell, ClipboardList, PackageCheck, Receipt } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useGetMeQuery } from '../../api/apiSlice';
import { useAppSelector } from '../../app/hooks';
import IconButton from '../../components/ui/IconButton';
import { cn } from '../../components/ui/cn';
import { useGetAlertsQuery, type Alert, type AlertKind } from './alertsApi';

const ICON: Record<AlertKind, typeof Bell> = {
  urgentStock: AlertTriangle, draftsWaiting: ClipboardList, deliveriesDue: PackageCheck, priceMissing: Receipt,
};
const TONE: Record<Alert['tone'], string> = {
  danger: 'bg-danger-soft text-danger', warning: 'bg-warning-soft text-warning', info: 'bg-info-soft text-info',
};

/** Bell in the top bar for staff and owner: what needs doing now (Step 3f). */
export default function AlertBell() {
  const t = useTranslations('alerts');
  const token = useAppSelector((s) => s.auth.accessToken);
  const { data: me } = useGetMeQuery(undefined, { skip: !token });
  const staff = me?.role === 'STAFF' || me?.role === 'SUPER_ADMIN';
  // Every minute as well: "due today" changes with the clock.
  const { data: alerts = [] } = useGetAlertsQuery(undefined, { skip: !staff, pollingInterval: 60_000 });
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!staff) return null;
  const total = alerts.reduce((sum, a) => sum + a.count, 0);
  const urgent = alerts.some((a) => a.tone === 'danger');

  return (
    <div ref={box} className="relative">
      <IconButton
        icon={Bell}
        label={total ? t('labelCount', { count: total }) : t('label')}
        count={total}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
        className={cn(urgent && '[&>span]:!bg-danger')}
      />
      {open && (
        <div className="fixed inset-x-4 top-16 z-40 overflow-hidden rounded-card border border-line bg-surface shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[22rem]">
          <p className="border-b border-line px-4 py-2.5 text-sm font-semibold text-fg">{t('title')}</p>
          {alerts.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-fg-muted">{t('none')}</p>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-line overflow-y-auto">
              {alerts.map((a) => {
                const Icon = ICON[a.kind];
                return (
                  <li key={a.kind}>
                    <Link href={a.href} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-3 hover:bg-surface-hover">
                      <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', TONE[a.tone])}>
                        <Icon size={16} aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-fg">{t(`kind.${a.kind}`, { count: a.count, extra: a.extra ?? 0 })}</span>
                        <span className="block truncate text-xs text-fg-muted">
                          {a.names.join(', ')}{a.count > a.names.length && a.kind === 'urgentStock' ? ` +${a.count - a.names.length}` : ''}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
