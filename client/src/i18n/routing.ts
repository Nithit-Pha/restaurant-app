import { defineRouting } from 'next-intl/routing';

export const locales = ['en', 'th'] as const;
export type Locale = (typeof locales)[number];

/**
 * Every page lives under /en/... or /th/... English is the main language:
 * an address without a language (an old link, "/menu") goes to /en/... The
 * browser language is not used to guess; customers pick Thai with the switch,
 * and a signed-in customer's choice is remembered on their account.
 */
export const routing = defineRouting({
  locales,
  defaultLocale: 'en',
  localePrefix: 'always',
  localeDetection: false,
  // Page metadata supplies the matching language URLs, including query strings.
  alternateLinks: false,
});

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}
