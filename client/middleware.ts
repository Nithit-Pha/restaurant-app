import createMiddleware from 'next-intl/middleware';
import { routing } from './src/i18n/routing';

// Adds /en or /th to addresses without one ("/menu" -> "/en/menu").
export default createMiddleware(routing);

export const config = {
  // Not for the API and image proxies, the revalidate hook, Next.js files,
  // or files with an extension (robots.txt, sitemap.xml, llms.txt, favicon.svg).
  matcher: ['/((?!api|uploads|revalidate|_next|_vercel|.*\\..*).*)'],
};
