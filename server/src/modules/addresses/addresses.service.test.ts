import { describe, it, expect, vi, beforeEach } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    address: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('../../config/db', () => ({ prisma: prismaMock }));

import { createAddress, updateAddress, deleteAddress, listAddresses, MAX_ADDRESSES } from './addresses.service';

const HOME = { label: ' Home ', text: ' 12 Sukhumvit Soi 11 ', lat: 13.7445, lng: 100.5551, note: '  ' };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.address.create.mockImplementation(async ({ data }: any) => ({ id: 'a-1', ...data }));
});

describe('addresses', () => {
  it('lists only the customer\'s own addresses, newest first', async () => {
    await listAddresses('user-1');
    expect(prismaMock.address.findMany).toHaveBeenCalledWith({ where: { userId: 'user-1' }, orderBy: { updatedAt: 'desc' } });
  });

  it('saves a new address for the customer, trimmed, with an empty note as none', async () => {
    prismaMock.address.count.mockResolvedValue(0);
    await createAddress('user-1', HOME);
    expect(prismaMock.address.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', label: 'Home', text: '12 Sukhumvit Soi 11', lat: 13.7445, lng: 100.5551, note: null },
    });
  });

  it(`refuses an address over the limit of ${MAX_ADDRESSES} (409)`, async () => {
    prismaMock.address.count.mockResolvedValue(MAX_ADDRESSES);
    await expect(createAddress('user-1', HOME)).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.address.create).not.toHaveBeenCalled();
  });

  it('changes an address only for its owner; another customer gets 404', async () => {
    prismaMock.address.updateMany.mockResolvedValue({ count: 0 });
    await expect(updateAddress('user-2', 'a-1', HOME)).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.address.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'a-1', userId: 'user-2' } }));

    prismaMock.address.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.address.findUnique.mockResolvedValue({ id: 'a-1' });
    await expect(updateAddress('user-1', 'a-1', HOME)).resolves.toEqual({ id: 'a-1' });
  });

  it('deletes an address only for its owner', async () => {
    prismaMock.address.deleteMany.mockResolvedValue({ count: 0 });
    await expect(deleteAddress('user-2', 'a-1')).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.address.deleteMany).toHaveBeenCalledWith({ where: { id: 'a-1', userId: 'user-2' } });
  });
});
