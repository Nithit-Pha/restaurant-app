import type { MetadataRoute } from 'next';
import { SITE_URL } from '../src/lib/site';
import { getCategories } from '../src/lib/api/server';
import { locales } from '../src/i18n/routing';

type Entry = MetadataRoute.Sitemap[number];

/**
 * One entry per page and language (/en/menu, /th/menu, ...), each listing
 * the other language versions (hreflang), so search engines show the right one.
 */
function localized(path: string, rest: Omit<Entry, 'url' | 'alternates'>): MetadataRoute.Sitemap {
  const suffix = path === '/' ? '' : path;
  const languages = Object.fromEntries(locales.map((l) => [l, `${SITE_URL}/${l}${suffix}`]));
  return locales.map((l) => ({ url: `${SITE_URL}/${l}${suffix}`, alternates: { languages }, ...rest }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const categories = await getCategories();
  const now = new Date();

  return [
    ...localized('/', { lastModified: now, changeFrequency: 'daily', priority: 1 }),
    ...localized('/menu', { lastModified: now, changeFrequency: 'daily', priority: 0.9 }),
    ...localized('/login', { lastModified: now, changeFrequency: 'yearly', priority: 0.2 }),
    ...localized('/register', { lastModified: now, changeFrequency: 'yearly', priority: 0.2 }),
    ...categories.flatMap((category) =>
      localized(`/menu?category=${encodeURIComponent(category)}`, { lastModified: now, changeFrequency: 'weekly', priority: 0.7 }),
    ),
  ];
}
