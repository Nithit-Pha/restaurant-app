import type { Metadata } from 'next';
import Link from 'next/link';
import { UtensilsCrossed } from 'lucide-react';
import { getMenuItems, getRestaurant } from '../src/lib/api/server';
import { formatCurrency } from '../src/lib/format';

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const r = await getRestaurant();
  return {
    title: `${r.name} — Order Online for Pickup & Delivery`,
    description: r.description,
    alternates: { canonical: '/' },
  };
}

const DAY_GROUPS: Record<string, string> = {
  'Monday,Tuesday,Wednesday,Thursday,Sunday': 'Mon – Thu, Sun',
  'Friday,Saturday': 'Fri – Sat',
};

export default async function HomePage() {
  const [items, RESTAURANT] = await Promise.all([getMenuItems(), getRestaurant()]);
  const featured = items.slice(0, 3);

  return (
    <main>
      {/* Hero */}
      <section className="bg-gradient-to-b from-brand-50 to-white dark:from-gray-800 dark:to-gray-900">
        <div className="max-w-5xl mx-auto px-4 py-16 sm:py-24 text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight">
            {RESTAURANT.name}
          </h1>
          <p className="mt-4 max-w-2xl mx-auto text-lg text-gray-600 dark:text-gray-300">
            {RESTAURANT.description}
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link
              href="/menu"
              className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-6 py-3 rounded-full shadow-sm"
            >
              View Menu &amp; Order
            </Link>
            <a
              href={`tel:${RESTAURANT.telephone}`}
              className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-semibold px-6 py-3 rounded-full hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Call {RESTAURANT.telephone}
            </a>
          </div>
        </div>
      </section>

      {/* Info strip: address, hours, cuisine */}
      <section className="border-y border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="max-w-5xl mx-auto px-4 py-10 grid grid-cols-1 sm:grid-cols-3 gap-8 text-center sm:text-left">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-600">Location</h2>
            <p className="mt-2 text-gray-700 dark:text-gray-300">
              {RESTAURANT.address.streetAddress}<br />
              {RESTAURANT.address.addressLocality}, {RESTAURANT.address.addressRegion} {RESTAURANT.address.postalCode}
            </p>
          </div>
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-600">Hours</h2>
            <ul className="mt-2 text-gray-700 dark:text-gray-300 space-y-0.5">
              {RESTAURANT.openingHours.map((h) => (
                <li key={h.dayOfWeek.join(',')}>
                  {DAY_GROUPS[h.dayOfWeek.join(',')] ?? h.dayOfWeek.join(', ')}: {h.opens} – {h.closes}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-600">Cuisine</h2>
            <p className="mt-2 text-gray-700 dark:text-gray-300">{RESTAURANT.servesCuisine.join(' · ')}</p>
            <p className="mt-1 text-gray-500 dark:text-gray-400 text-sm">Price range: {RESTAURANT.priceRange}</p>
          </div>
        </div>
      </section>

      {/* Featured items */}
      {featured.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 py-14">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Popular right now</h2>
            <Link href="/menu" className="text-brand-600 hover:underline text-sm font-medium">See full menu →</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {featured.map((item) => (
              <Link
                key={item.id}
                href={`/menu?category=${encodeURIComponent(item.category)}`}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden flex flex-col hover:shadow-md transition-shadow"
              >
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.name} className="w-full h-40 object-cover" />
                ) : (
                  <div className="w-full h-40 bg-surface-muted flex items-center justify-center text-fg-subtle"><UtensilsCrossed size={28} strokeWidth={1.5} aria-hidden /></div>
                )}
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white">{item.name}</h3>
                  {item.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{item.description}</p>
                  )}
                  <p className="mt-3 font-bold text-brand-600">{formatCurrency(item.sellingPrice)}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* CTA footer */}
      <section className="bg-brand-500">
        <div className="max-w-5xl mx-auto px-4 py-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white">Hungry? Order online in minutes.</h2>
          <p className="mt-2 text-brand-50">Pickup or delivery — fresh food, made to order.</p>
          <Link
            href="/menu"
            className="mt-6 inline-block bg-white text-brand-600 font-semibold px-6 py-3 rounded-full shadow-sm hover:bg-brand-50"
          >
            Browse the Menu
          </Link>
        </div>
      </section>
    </main>
  );
}
