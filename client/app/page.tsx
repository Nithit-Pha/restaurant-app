import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Clock, MapPin, Phone, UtensilsCrossed } from 'lucide-react';
import { getMenuItems, getRestaurant } from '../src/lib/api/server';
import { formatCurrency } from '../src/lib/format';
import ClosedBanner from '../src/features/orders/ClosedBanner';
import { Card, PageContainer, buttonClasses } from '../src/components/ui';

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

function InfoRow({ icon: Icon, label, children }: { icon: typeof Clock; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon size={18} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-fg-subtle" />
      <div className="min-w-0">
        <h2 className="text-xs font-medium uppercase tracking-wide text-fg-muted">{label}</h2>
        <div className="mt-1 text-sm text-fg">{children}</div>
      </div>
    </div>
  );
}

export default async function HomePage() {
  const [items, RESTAURANT] = await Promise.all([getMenuItems(), getRestaurant()]);
  const featured = items.slice(0, 3);

  return (
    <PageContainer>
      {/* Welcome + practical info */}
      <section className="grid items-start gap-8 pb-10 pt-2 lg:grid-cols-[minmax(0,1fr)_19rem] lg:pt-6">
        <div>
          <p className="text-sm font-medium text-accent">Pickup &amp; delivery · {RESTAURANT.servesCuisine.join(' · ')}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{RESTAURANT.name}</h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-fg-muted">{RESTAURANT.description}</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/menu" className={buttonClasses('primary', 'lg')}>
              View menu &amp; order
              <ArrowRight size={16} strokeWidth={1.75} aria-hidden />
            </Link>
            <a href={`tel:${RESTAURANT.telephone}`} className={buttonClasses('secondary', 'lg')}>
              <Phone size={16} strokeWidth={1.75} aria-hidden />
              Call {RESTAURANT.telephone}
            </a>
          </div>
          <ClosedBanner className="mt-6 max-w-xl" />
        </div>

        <Card className="space-y-5 p-5">
          <InfoRow icon={MapPin} label="Location">
            {RESTAURANT.address.streetAddress}
            <br />
            {RESTAURANT.address.addressLocality}, {RESTAURANT.address.addressRegion} {RESTAURANT.address.postalCode}
          </InfoRow>
          <InfoRow icon={Clock} label="Hours">
            <ul className="space-y-0.5">
              {RESTAURANT.openingHours.map((h) => (
                <li key={h.dayOfWeek.join(',')} className="flex justify-between gap-4">
                  <span className="text-fg-muted">{DAY_GROUPS[h.dayOfWeek.join(',')] ?? h.dayOfWeek.join(', ')}</span>
                  <span className="tabular-nums">{h.opens} – {h.closes}</span>
                </li>
              ))}
            </ul>
          </InfoRow>
          <InfoRow icon={UtensilsCrossed} label="Cuisine">
            {RESTAURANT.servesCuisine.join(' · ')}
            <span className="block text-fg-muted">Price range: {RESTAURANT.priceRange}</span>
          </InfoRow>
        </Card>
      </section>

      {/* Featured items */}
      {featured.length > 0 && (
        <section className="border-t border-line pt-10">
          <div className="mb-5 flex items-end justify-between gap-4">
            <h2 className="text-xl font-semibold text-fg">Popular right now</h2>
            <Link href="/menu" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline underline-offset-2">
              See full menu
              <ArrowRight size={14} strokeWidth={1.75} aria-hidden />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {featured.map((item) => (
              <Link
                key={item.id}
                href={`/menu?category=${encodeURIComponent(item.category)}`}
                className="group flex flex-col overflow-hidden rounded-card border border-line bg-surface transition-shadow duration-150 hover:shadow-soft"
              >
                <div className="aspect-[3/2] overflow-hidden bg-surface-muted">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-fg-subtle">
                      <UtensilsCrossed size={28} strokeWidth={1.5} aria-hidden />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <h3 className="font-medium text-fg">{item.name}</h3>
                  {item.description && <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{item.description}</p>}
                  <p className="mt-auto pt-3 font-semibold tabular-nums text-fg">{formatCurrency(item.sellingPrice)}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </PageContainer>
  );
}
