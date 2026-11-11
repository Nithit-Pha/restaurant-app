import { prisma } from '../../config/db';

/** A customer may keep this many addresses. */
export const MAX_ADDRESSES = 10;

export interface AddressInput {
  label: string;
  text: string;
  lat: number;
  lng: number;
  note?: string | null;
}

const httpError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

const clean = (a: AddressInput) => ({
  label: a.label.trim(),
  text: a.text.trim(),
  lat: a.lat,
  lng: a.lng,
  note: a.note?.trim() || null,
});

/** The customer's own addresses, last used / added first. */
export function listAddresses(userId: string) {
  return prisma.address.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } });
}

export async function createAddress(userId: string, input: AddressInput) {
  const count = await prisma.address.count({ where: { userId } });
  if (count >= MAX_ADDRESSES) {
    throw httpError(409, `You can keep up to ${MAX_ADDRESSES} addresses. Remove one to add another.`);
  }
  return prisma.address.create({ data: { ...clean(input), userId } });
}

/** Only the owner can change an address; anyone else gets 404, as if it did not exist. */
export async function updateAddress(userId: string, id: string, input: AddressInput) {
  const { count } = await prisma.address.updateMany({ where: { id, userId }, data: clean(input) });
  if (count === 0) throw httpError(404, 'Address not found');
  return prisma.address.findUnique({ where: { id } });
}

export async function deleteAddress(userId: string, id: string) {
  const { count } = await prisma.address.deleteMany({ where: { id, userId } });
  if (count === 0) throw httpError(404, 'Address not found');
}
