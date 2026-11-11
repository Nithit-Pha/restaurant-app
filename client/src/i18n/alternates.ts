import type { Metadata } from 'next';
import { locales } from './routing';

/**
 * canonical + hreflang links for a page, e.g. path "/menu" in Thai:
 * canonical /th/menu, alternates en -> /en/menu, th -> /th/menu, x-default -> /en/menu.
 */
export function localeAlternates(locale: string, path: string): Metadata['alternates'] {
  const suffix = path === '/' ? '' : path;
  return {
    canonical: `/${locale}${suffix}`,
    languages: {
      ...Object.fromEntries(locales.map((l) => [l, `/${l}${suffix}`])),
      'x-default': `/en${suffix}`,
    },
  };
}
