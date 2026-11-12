'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import IconButton from './ui/IconButton';
import { cn } from './ui/cn';

/**
 * Controls in the top-right corner of every page: theme switch now, the
 * EN | ไทย language switch joins it here with Phase 1f (Thai / English).
 */
export default function TopBarControls({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <div className={cn('flex items-center gap-1', className)}>
      {/* Phase 1f: language switch (EN | ไทย) goes here, before the theme button. */}
      <IconButton
        icon={dark ? Sun : Moon}
        // A toggle keeps one name; aria-pressed says whether it is on.
        label="Dark theme"
        aria-pressed={dark}
        onClick={toggle}
      />
    </div>
  );
}
