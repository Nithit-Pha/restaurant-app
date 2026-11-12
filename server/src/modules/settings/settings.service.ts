import { prisma } from '../../config/db';
import { env } from '../../config/env';
import { isOpenAt, nextOpening, type NextOpening } from '../../utils/businessTime';
import {
  DEFAULT_PAUSE_MESSAGE,
  modeSettings,
  orderingMode,
  resolveOrdering,
  type ClosedReason,
  type OrderingMode,
} from '../../utils/orderingMode';

const DEFAULTS: Record<string, string> = {
  TAX_RATE: String(env.taxRate),
  DELIVERY_BASE_FEE: String(env.deliveryBaseFee),
  DELIVERY_FEE_PER_KM: String(env.deliveryFeePerKm),
  DELIVERY_FREE_KM: String(env.deliveryFreeKm),
  DELIVERY_MAX_KM: String(env.deliveryMaxKm),
  // 1 = refuse orders outside the restaurant's opening hours, 0 = always accept.
  ORDERING_HOURS_ENFORCED: '1',
  // Busy mode (staff, during a rush): 1 = no new orders; minutes added to the estimate.
  ORDERING_PAUSED: '0',
  BUSY_EXTRA_MINUTES: '0',
  // Cooking time used when the kitchen accepts an order with one tap (no time chosen).
  DEFAULT_PREP_MINUTES: '15',
};
const PAUSE_MESSAGE_KEY = 'ORDERING_PAUSE_MESSAGE';

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

// ---- Payment (PromptPay) ----------------------------------------------
export interface PaymentSettings {
  promptPayId: string; // '' = PromptPay is not offered at checkout
  promptPayName: string; // account name the customer should see in their bank app
}

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const rows = await prisma.setting.findMany({ where: { key: { in: ['PROMPTPAY_ID', 'PROMPTPAY_NAME'] } } });
  const get = (key: string) => rows.find((r) => r.key === key)?.value ?? '';
  return { promptPayId: get('PROMPTPAY_ID'), promptPayName: get('PROMPTPAY_NAME') };
}

export async function setPaymentSettings(s: PaymentSettings) {
  for (const [key, value] of [['PROMPTPAY_ID', s.promptPayId], ['PROMPTPAY_NAME', s.promptPayName]]) {
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  return getPaymentSettings();
}

/** Public: which payment methods checkout offers. */
export async function getPaymentOptions() {
  const { promptPayId, promptPayName } = await getPaymentSettings();
  return { cash: true, promptPay: promptPayId !== '', promptPayName };
}

// ---- Busy mode --------------------------------------------------------
export interface BusyMode {
  mode: OrderingMode;
  busyExtraMinutes: number;
  pauseMessage: string; // what customers see while paused
}

export async function getBusyMode(): Promise<BusyMode> {
  const [paused, extra, message] = await Promise.all([
    getSetting('ORDERING_PAUSED'),
    getSetting('BUSY_EXTRA_MINUTES'),
    prisma.setting.findUnique({ where: { key: PAUSE_MESSAGE_KEY } }),
  ]);
  return {
    mode: orderingMode(paused, extra),
    busyExtraMinutes: extra,
    pauseMessage: message?.value || DEFAULT_PAUSE_MESSAGE,
  };
}

/** Minutes for an order accepted without a chosen time: the default, plus the busy-mode extra. */
export async function defaultPrepMinutes(): Promise<number> {
  const [base, busy] = await Promise.all([getSetting('DEFAULT_PREP_MINUTES'), getBusyMode()]);
  const minutes = Math.round(base) + (busy.mode === 'BUSY' ? busy.busyExtraMinutes : 0);
  return Math.min(240, Math.max(1, minutes));
}

export async function setBusyMode(mode: OrderingMode, extraMinutes?: number, pauseMessage?: string) {
  const { paused, busyExtraMinutes } = modeSettings(mode, extraMinutes);
  await setSetting('ORDERING_PAUSED', paused);
  await setSetting('BUSY_EXTRA_MINUTES', busyExtraMinutes);
  if (pauseMessage !== undefined) {
    // '' goes back to the default text.
    await prisma.setting.upsert({
      where: { key: PAUSE_MESSAGE_KEY },
      update: { value: pauseMessage },
      create: { key: PAUSE_MESSAGE_KEY, value: pauseMessage },
    });
  }
  return getBusyMode();
}

// ---- Open / closed ----------------------------------------------------
export interface OpenStatus extends BusyMode {
  isOpen: boolean; // false when paused, or outside opening hours that are enforced
  closedReason: ClosedReason | null;
  enforced: boolean;
  nextOpening: NextOpening | null;
  timeZone: string;
  /** Usual cooking time, preselected when staff accept an order. */
  defaultPrepMinutes: number;
}

/** Whether online ordering is open right now (public: storefront banner). */
export async function getOpenStatus(now: Date = new Date()): Promise<OpenStatus> {
  const [profile, enforced, busy, prep] = await Promise.all([
    getRestaurantProfile(),
    getSetting('ORDERING_HOURS_ENFORCED'),
    getBusyMode(),
    getSetting('DEFAULT_PREP_MINUTES'),
  ]);
  const tz = env.businessTimeZone;
  const open = isOpenAt(profile.openingHours, now, tz);
  const { isOpen, closedReason } = resolveOrdering({ mode: busy.mode, hoursEnforced: enforced !== 0, openByHours: open });
  return {
    isOpen,
    closedReason,
    ...busy,
    enforced: enforced !== 0,
    nextOpening: open ? null : nextOpening(profile.openingHours, now, tz),
    timeZone: tz,
    defaultPrepMinutes: Math.round(prep),
  };
}
