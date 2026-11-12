import 'dotenv/config';

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const env = {
  port: parseInt(process.env.PORT ?? '3001', 10),
  // Network address the API listens on. 127.0.0.1 = only this PC (the website
  // proxies /api to it), so other devices on the Wi-Fi cannot call it directly.
  host: process.env.HOST ?? '127.0.0.1',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  // The website's hook that regenerates the cached menu pages (a dish became sold out).
  revalidateUrl: process.env.REVALIDATE_URL ?? 'http://127.0.0.1:5173/revalidate',

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },

  taxRate: parseFloat(process.env.TAX_RATE ?? '0.07'),
  // Money in THB
  deliveryBaseFee: parseFloat(process.env.DELIVERY_BASE_FEE ?? '30'),
  deliveryFeePerKm: parseFloat(process.env.DELIVERY_FEE_PER_KM ?? '10'),
  deliveryFreeKm: parseFloat(process.env.DELIVERY_FREE_KM ?? '3'),
  deliveryMaxKm: parseFloat(process.env.DELIVERY_MAX_KM ?? '0'), // 0 = no limit

  // Business day, order numbers and opening hours use this time zone.
  businessTimeZone: process.env.BUSINESS_TIMEZONE ?? 'Asia/Bangkok',

  storageProvider: (process.env.STORAGE_PROVIDER ?? 'local') as 'local' | 's3' | 'cloudinary',
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
};
