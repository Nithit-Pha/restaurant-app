import { prisma } from '../../config/db';
import { env } from '../../config/env';

const DEFAULTS: Record<string, string> = {
  TAX_RATE: String(env.taxRate),
  DELIVERY_BASE_FEE: String(env.deliveryBaseFee),
  DELIVERY_FEE_PER_KM: String(env.deliveryFeePerKm),
  DELIVERY_FREE_KM: String(env.deliveryFreeKm),
  DELIVERY_MAX_KM: String(env.deliveryMaxKm),
};

// ---- Restaurant profile (name, hours, address, etc.) ------------------
const RESTAURANT_KEY = 'RESTAURANT_PROFILE';

export interface RestaurantProfile {
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

export const DEFAULT_RESTAURANT: RestaurantProfile = {
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

export async function getRestaurantProfile(): Promise<RestaurantProfile> {
  const row = await prisma.setting.findUnique({ where: { key: RESTAURANT_KEY } });
  if (!row?.value) return DEFAULT_RESTAURANT;
  try {
    // Merge over defaults so missing keys are always populated.
    return { ...DEFAULT_RESTAURANT, ...(JSON.parse(row.value) as Partial<RestaurantProfile>) } as RestaurantProfile;
  } catch {
    return DEFAULT_RESTAURANT;
  }
}

export async function setRestaurantProfile(profile: RestaurantProfile) {
  const value = JSON.stringify(profile);
  return prisma.setting.upsert({
    where: { key: RESTAURANT_KEY },
    update: { value },
    create: { key: RESTAURANT_KEY, value },
  });
}

// ---- Numeric settings (tax / delivery) --------------------------------
export async function getSettings() {
  const rows = await prisma.setting.findMany();
  const result: Record<string, number> = {};
  for (const [key, def] of Object.entries(DEFAULTS)) {
    const row = rows.find((r) => r.key === key);
    result[key] = parseFloat(row?.value ?? def);
  }
  return result;
}

export async function getSetting(key: string): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return parseFloat(row?.value ?? DEFAULTS[key] ?? '0');
}

export async function setSetting(key: string, value: number) {
  return prisma.setting.upsert({
    where: { key },
    update: { value: String(value) },
    create: { key, value: String(value) },
  });
}

export async function seedDefaultSettings() {
  for (const [key, value] of Object.entries(DEFAULTS)) {
    await prisma.setting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }
  await prisma.setting.upsert({
    where: { key: RESTAURANT_KEY },
    update: {},
    create: { key: RESTAURANT_KEY, value: JSON.stringify(DEFAULT_RESTAURANT) },
  });
}
