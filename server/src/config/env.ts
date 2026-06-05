import 'dotenv/config';

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const env = {
  port: parseInt(process.env.PORT ?? '3001', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },

  taxRate: parseFloat(process.env.TAX_RATE ?? '0.07'),
  deliveryBaseFee: parseFloat(process.env.DELIVERY_BASE_FEE ?? '3.99'),
  deliveryFeePerKm: parseFloat(process.env.DELIVERY_FEE_PER_KM ?? '1.00'),
  deliveryFreeKm: parseFloat(process.env.DELIVERY_FREE_KM ?? '3'),

  storageProvider: (process.env.STORAGE_PROVIDER ?? 'local') as 'local' | 's3' | 'cloudinary',
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
};
