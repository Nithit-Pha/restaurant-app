'use client';

import { Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from '../context/ThemeContext';
import IconButton from './ui/IconButton';
import { cn } from './ui/cn';
import LanguageSwitch from './LanguageSwitch';
import AlertBell from '../features/alerts/AlertBell';

/** Controls in the top-right corner of every page: alerts (staff), language (EN | ไทย) and theme. */
export default function TopBarControls({ className }: { className?: string }) {
  const t = useTranslations('nav');
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <AlertBell />
      <LanguageSwitch />
      <IconButton
        icon={dark ? Sun : Moon}
        // A toggle keeps one name; aria-pressed says whether it is on.
        label={t('darkTheme')}
        aria-pressed={dark}
        onClick={toggle}
      />
    </div>
  );
}
