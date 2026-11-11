import type { Metadata } from 'next';
import { UtensilsCrossed } from 'lucide-react';
import { getCategories, getMenuItems, getRestaurant } from '../../src/lib/api/server';
import { SITE_URL } from '../../src/lib/site';
import { CURRENCY } from '../../src/lib/format';
import MenuItemCard from '../../src/features/menu/MenuItemCard';
import CategoryTabs from '../../src/features/menu/CategoryTabs';
import ClosedBanner from '../../src/features/orders/ClosedBanner';
import { EmptyState, PageContainer, PageHeader } from '../../src/components/ui';

export const revalidate = 300; // ISR: re-fetch the menu at most every 5 minutes

interface PageProps {
  searchParams: { category?: string };
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const category = searchParams.category;
  const r = await getRestaurant();
  const title = category ? `${category} Menu` : 'Our Menu';
  const description = category
    ? `Browse our ${category.toLowerCase()} — order online for pickup or delivery from ${r.name}.`
    : `Browse the full ${r.name} menu and order online for pickup or delivery.`;
  const canonical = category ? `/menu?category=${encodeURIComponent(category)}` : '/menu';

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title: `${title} · ${r.name}`, description, url: canonical },
  };
}

export default async function MenuPage({ searchParams }: PageProps) {
  const category = searchParams.category;
  const [items, categories, r] = await Promise.all([
    getMenuItems(category),
    getCategories(),
    getRestaurant(),
  ]);

  const menuJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Menu',
    name: category ? `${category} — ${r.name} Menu` : `${r.name} Menu`,
    url: `${SITE_URL}/menu${category ? `?category=${encodeURIComponent(category)}` : ''}`,
    hasMenuItem: items.map((item) => ({
      '@type': 'MenuItem',
      name: item.name,
      description: item.description || undefined,
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(menuJsonLd) }}
      />
      <PageHeader
        title={category ? `${category}` : 'Our Menu'}
        description={`Order for pickup or delivery from ${r.name}.`}
      />
      <ClosedBanner className="mb-5" />
      <CategoryTabs categories={categories} active={category} />
      {items.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title="No items in this category."
          description="Try another category, or look at the whole menu."
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
