import { prisma } from '../../config/db';
import { env } from '../../config/env';

const DEFAULTS: Record<string, string> = {
  TAX_RATE: String(env.taxRate),
  DELIVERY_BASE_FEE: String(env.deliveryBaseFee),
  DELIVERY_FEE_PER_KM: String(env.deliveryFeePerKm),
  DELIVERY_FREE_KM: String(env.deliveryFreeKm),
};

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
}
