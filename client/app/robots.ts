import type { MetadataRoute } from 'next';
import { SITE_URL } from '../src/lib/site';
import { locales } from '../src/i18n/routing';

// Private pages, in every language (/en/checkout, /th/checkout, ...).
const PRIVATE = ['/checkout', '/orders', '/admin', '/login', '/register', '/dev'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: locales.flatMap((l) => PRIVATE.map((p) => `/${l}${p}`)),
      },
      // AI crawlers — explicitly allowed so AI search engines can read and cite this site (plan §10.5)
      { userAgent: 'GPTBot', allow: '/' },
      { userAgent: 'OAI-SearchBot', allow: '/' },
      { userAgent: 'PerplexityBot', allow: '/' },
      { userAgent: 'Google-Extended', allow: '/' },
      { userAgent: 'ClaudeBot', allow: '/' },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
