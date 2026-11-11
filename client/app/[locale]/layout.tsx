import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import AppShell from '../../src/components/AppShell';
import { ToastProvider } from '../../src/components/ui/Toast';
import { ThemeProvider } from '../../src/context/ThemeContext';
import CartDrawer from '../../src/features/cart/CartDrawer';
import { buildOrgJsonLd, serializeJsonLd, SITE_URL } from '../../src/lib/site';
import { getRestaurant } from '../../src/lib/api/server';
import { isLocale, locales } from '../../src/i18n/routing';
// IBM Plex Sans (Latin) + IBM Plex Sans Thai, self-hosted so it works offline.
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans-thai/thai-400.css';
import '@fontsource/ibm-plex-sans-thai/thai-500.css';
import '@fontsource/ibm-plex-sans-thai/thai-600.css';
import '../globals.css';

type Props = { children: React.ReactNode; params: { locale: string } };

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params: { locale } }: Omit<Props, 'children'>): Promise<Metadata> {
  const r = await getRestaurant();
  const t = await getTranslations({ locale, namespace: 'meta' });
  const logo = `${SITE_URL}/favicon.svg`;
  const title = t('title', { name: r.name });
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: title,
      template: `%s · ${r.name}`,
    },
    description: r.description,
    applicationName: r.name,
    // Each language version points at the other (hreflang); pages add their own path.
    alternates: {
      canonical: `/${locale}`,
      languages: { en: '/en', th: '/th', 'x-default': '/en' },
    },
    openGraph: {
      type: 'website',
      siteName: r.name,
      title,
      description: r.description,
      url: `${SITE_URL}/${locale}`,
      locale: locale === 'th' ? 'th_TH' : 'en_US',
      images: [{ url: logo }],
    },
    twitter: {
      card: 'summary',
      title,
      description: r.description,
      images: [logo],
    },
    icons: {
      icon: '/favicon.svg',
    },
  };
}

// Runs before paint to set the `dark` class from the persisted preference,
// preventing a light->dark flash on reload. Kept tiny and inline.
const themeInitScript = `
(function () {
  try {
    var saved = localStorage.getItem('theme');
    var dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) document.documentElement.classList.add('dark');
  } catch (_) {}
})();
`;

export default async function LocaleLayout({ children, params: { locale } }: Props) {
  // The [locale] segment also catches unknown addresses like /xx/menu.
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale); // lets the pages below render statically
  const [restaurant, messages] = await Promise.all([getRestaurant(), getMessages()]);
  const orgJsonLd = buildOrgJsonLd(restaurant);
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(orgJsonLd) }}
        />
      </head>
      <body suppressHydrationWarning>
        <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Bangkok">
          <ThemeProvider>
            <ToastProvider>
              <AppShell restaurantName={restaurant.name}>{children}</AppShell>
              <CartDrawer />
            </ToastProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
