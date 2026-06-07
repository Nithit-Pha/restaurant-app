// Central restaurant info for SEO metadata and schema.org JSON-LD.
// Live values are stored in the DB (Super Admin editable) and fetched via
// getRestaurant() in lib/api/server.ts. The defaults below are the fallback
// used before anything is saved, and for static routes (robots/sitemap).
export const SITE_URL =
  process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:5173';

export interface Restaurant {
  name: string;
  legalName: string;
  description: string;
  telephone: string;
  priceRange: string;
  servesCuisine: string[];
  address: {
    streetAddress: string;
    addressLocality: string;
    addressRegion: string;
    postalCode: string;
    addressCountry: string;
  };
  geo: { latitude: number; longitude: number };
  openingHours: { dayOfWeek: string[]; opens: string; closes: string }[];
  sameAs: string[];
}

export const DEFAULT_RESTAURANT: Restaurant = {
  name: 'RestaurantApp',
  legalName: 'RestaurantApp LLC',
  description:
    'RestaurantApp is a modern neighborhood restaurant serving fresh, made-to-order meals for pickup and delivery — browse our menu and order online in minutes.',
  telephone: '+1-555-010-2020',
  priceRange: '$$',
  servesCuisine: ['American', 'Comfort Food'],
  address: {
    streetAddress: '123 Main Street',
    addressLocality: 'Springfield',
    addressRegion: 'IL',
    postalCode: '62704',
    addressCountry: 'US',
  },
  geo: { latitude: 39.7817, longitude: -89.6501 },
  openingHours: [
    { dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Sunday'], opens: '11:00', closes: '21:00' },
    { dayOfWeek: ['Friday', 'Saturday'], opens: '11:00', closes: '22:30' },
  ],
  sameAs: [],
};

/** Build the schema.org Restaurant JSON-LD from a profile. */
export function buildOrgJsonLd(r: Restaurant) {
  const logo = `${SITE_URL}/favicon.svg`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: r.name,
    legalName: r.legalName,
    description: r.description,
    url: SITE_URL,
    logo,
    image: logo,
    telephone: r.telephone,
    priceRange: r.priceRange,
    servesCuisine: r.servesCuisine,
    address: { '@type': 'PostalAddress', ...r.address },
    geo: { '@type': 'GeoCoordinates', latitude: r.geo.latitude, longitude: r.geo.longitude },
    openingHoursSpecification: r.openingHours.map((h) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: h.dayOfWeek,
      opens: h.opens,
      closes: h.closes,
    })),
    sameAs: r.sameAs,
    acceptsReservations: 'False',
    menu: `${SITE_URL}/menu`,
  };
}

// Static fallbacks (used by robots.ts / sitemap.ts and as the pre-save default).
export const RESTAURANT = DEFAULT_RESTAURANT;
export const ORG_JSON_LD = buildOrgJsonLd(DEFAULT_RESTAURANT);
