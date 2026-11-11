import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { UtensilsCrossed } from 'lucide-react';
import { localeAlternates } from '@/i18n/alternates';
import { getCategories, getMenuItems, getRestaurant } from '../../../src/lib/api/server';
import { serializeJsonLd, SITE_URL } from '../../../src/lib/site';
import { CURRENCY } from '../../../src/lib/format';
import { itemDescription, itemName } from '../../../src/lib/localized';
import MenuItemCard from '../../../src/features/menu/MenuItemCard';
import CategoryTabs from '../../../src/features/menu/CategoryTabs';
import ClosedBanner from '../../../src/features/orders/ClosedBanner';
import { EmptyState, PageContainer, PageHeader } from '../../../src/components/ui';

export const revalidate = 300; // ISR: re-fetch the menu at most every 5 minutes

interface PageProps {
  params: { locale: string };
  searchParams: { category?: string };
}

export async function generateMetadata({ params: { locale }, searchParams }: PageProps): Promise<Metadata> {
  const category = searchParams.category;
  const [r, t] = await Promise.all([getRestaurant(), getTranslations({ locale, namespace: 'menu' })]);
  const title = category ? t('metaTitleCategory', { category }) : t('title');
  const description = category
    ? t('metaDescriptionCategory', { category, name: r.name })
    : t('metaDescription', { name: r.name });
  const path = category ? `/menu?category=${encodeURIComponent(category)}` : '/menu';

  return {
    title,
    description,
    alternates: localeAlternates(locale, path),
    openGraph: { title: `${title} · ${r.name}`, description, url: `/${locale}${path}` },
  };
}

export default async function MenuPage({ params: { locale }, searchParams }: PageProps) {
  setRequestLocale(locale);
  const category = searchParams.category;
  const [items, categories, r, t] = await Promise.all([
    getMenuItems(category),
    getCategories(),
    getRestaurant(),
    getTranslations('menu'),
  ]);

  const menuJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Menu',
    inLanguage: locale,
    name: category ? `${category} — ${r.name}` : r.name,
    url: `${SITE_URL}/${locale}/menu${category ? `?category=${encodeURIComponent(category)}` : ''}`,
    hasMenuItem: items.map((item) => ({
      '@type': 'MenuItem',
      name: itemName(item, locale),
      description: itemDescription(item, locale),
      image: item.imageUrl ? (item.imageUrl.startsWith('http') ? item.imageUrl : `${SITE_URL}${item.imageUrl}`) : undefined,
      offers: {
        '@type': 'Offer',
        price: item.sellingPrice,
        priceCurrency: CURRENCY,
        availability: item.isAvailable ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      },
      category: item.category,
    })),
  };

  return (
    <PageContainer wide>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(menuJsonLd) }}
      />
      <PageHeader
        title={category ? `${category}` : t('title')}
        description={t('subtitle', { name: r.name })}
      />
      <ClosedBanner className="mb-5" />
      <CategoryTabs categories={categories} active={category} />
      {items.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          className="mt-6"
        />
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {items.map((item) => (
            <MenuItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
