'use client';

import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { locales, type Locale } from '@/i18n/routing';
import { useAppSelector } from '../app/hooks';
import { useSetMyLocaleMutation } from '../api/apiSlice';
import { cn } from './ui/cn';

// Each language names itself, so a reader of the other language still finds it.
const NAMES: Record<Locale, string> = { en: 'EN', th: 'ไทย' };
const FULL_NAMES: Record<Locale, string> = { en: 'English', th: 'ภาษาไทย' };

/**
 * EN | ไทย in the top-right corner. Switching keeps the page (and its query,
 * e.g. ?category=Mains) and remembers the choice on a signed-in account.
 */
export default function LanguageSwitch() {
  const t = useTranslations('nav');
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const signedIn = useAppSelector((s) => Boolean(s.auth.accessToken));
  const [saveLocale, { isLoading: saving }] = useSetMyLocaleMutation();
  const [pending, startTransition] = useTransition();

  const choose = async (next: Locale) => {
    if (next === locale) return;
    const { search, hash } = window.location;
    if (signedIn) await saveLocale(next);
    startTransition(() => router.replace(`${pathname}${search}${hash}`, { locale: next }));
  };

  return (
    <div role="group" aria-label={t('language')} className={cn('flex rounded-control border border-line p-0.5', (saving || pending) && 'opacity-60')}>
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={l === locale}
          aria-label={FULL_NAMES[l]}
          disabled={saving || pending}
          onClick={() => choose(l)}
          className={cn(
            'h-7 min-w-[2.5rem] rounded-[6px] px-2 text-xs font-medium transition-colors duration-150',
            l === locale ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
          )}
        >
          {NAMES[l]}
        </button>
      ))}
    </div>
  );
}
