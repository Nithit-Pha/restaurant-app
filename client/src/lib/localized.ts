import type { MenuItem } from '../api/apiSlice';

/** The API sends English detail. Use the screen's localized message in Thai. */
export function apiErrorMessage(error: unknown, locale: string, fallback: string): string {
  if (locale !== 'en') return fallback;
  const detail = (error as { data?: { message?: unknown } } | undefined)?.data?.message;
  return typeof detail === 'string' && detail ? detail : fallback;
}

/** The dish name in the page's language; Thai falls back to English when not filled in. */
export function itemName(item: Pick<MenuItem, 'name' | 'nameTh'>, locale: string): string {
  return (locale === 'th' && item.nameTh?.trim()) || item.name;
}

/** The dish description in the page's language, with the same fallback. */
export function itemDescription(item: Pick<MenuItem, 'description' | 'descriptionTh'>, locale: string): string | undefined {
  return (locale === 'th' && item.descriptionTh?.trim()) || item.description || undefined;
}
