import type { Metadata } from 'next';
import Providers from '../src/components/Providers';
import AppShell from '../src/components/AppShell';
import CartDrawer from '../src/features/cart/CartDrawer';
import { buildOrgJsonLd, SITE_URL } from '../src/lib/site';
import { getRestaurant } from '../src/lib/api/server';
// IBM Plex Sans (Latin) + IBM Plex Sans Thai, self-hosted so it works offline.
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans-thai/thai-400.css';
import '@fontsource/ibm-plex-sans-thai/thai-500.css';
import '@fontsource/ibm-plex-sans-thai/thai-600.css';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const r = await getRestaurant();
  const logo = `${SITE_URL}/favicon.svg`;
  const title = `${r.name} — Order Online for Pickup & Delivery`;
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: title,
      template: `%s · ${r.name}`,
    },
    description: r.description,
    applicationName: r.name,
    openGraph: {
      type: 'website',
      siteName: r.name,
      title,
      description: r.description,
      url: SITE_URL,
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const restaurant = await getRestaurant();
  const orgJsonLd = buildOrgJsonLd(restaurant);
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
      </head>
      <body suppressHydrationWarning>
        <Providers>
          <AppShell restaurantName={restaurant.name}>{children}</AppShell>
          <CartDrawer />
        </Providers>
      </body>
    </html>
  );
}
