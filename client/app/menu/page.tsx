import type { Metadata } from 'next';
import { getCategories, getMenuItems, getRestaurant } from '../../src/lib/api/server';
import { SITE_URL } from '../../src/lib/site';
import { CURRENCY } from '../../src/lib/format';
import MenuItemCard from '../../src/features/menu/MenuItemCard';
import CategoryTabs from '../../src/features/menu/CategoryTabs';
import ClosedBanner from '../../src/features/orders/ClosedBanner';

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
    <div className="max-w-6xl mx-auto px-4 py-8">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(menuJsonLd) }}
      />
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
        {category ? `${category}` : 'Our Menu'}
      </h1>
      <ClosedBanner className="mb-6" />
      <CategoryTabs categories={categories} active={category} />
      {items.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 mt-8 text-center">No items in this category.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          {items.map((item) => (
            <MenuItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
