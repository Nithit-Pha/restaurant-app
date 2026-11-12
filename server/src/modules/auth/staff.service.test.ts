import { describe, it, expect, vi, beforeEach } from 'vitest';

const { prismaMock, auditMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findUnique: vi.fn(), delete: vi.fn(), update: vi.fn() },
    address: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
  auditMock: vi.fn(),
}));

vi.mock('../../config/db', () => ({ prisma: prismaMock }));
vi.mock('../../utils/auditLog', () => ({ audit: auditMock }));

import { deleteStaffAccount, DELETED_NAME, DELETED_USERNAME_PREFIX } from './staff.service';

const NONE = {
  orders: 0, expenses: 0, auditLogs: 0, statusChanges: 0, confirmedPayments: 0,
  confirmedVisits: 0, stockMovements: 0, purchaseOrdersCreated: 0, purchaseOrdersSent: 0,
};
const account = (over: Record<string, unknown> = {}) => ({
  id: 'u-1', username: 'somchai', role: 'STAFF', isActive: false, _count: { ...NONE }, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockResolvedValue([]);
});

describe('deleteStaffAccount', () => {
  it('removes an account that was never used', async () => {
    prismaMock.user.findUnique.mockResolvedValue(account());
    expect(await deleteStaffAccount('u-1', 'owner')).toEqual({ mode: 'REMOVED' });
    expect(prismaMock.user.delete).toHaveBeenCalledWith({ where: { id: 'u-1' } });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(auditMock).toHaveBeenCalledWith({
      actorId: 'owner', action: 'DELETE', entityType: 'USER', entityId: 'u-1', metadata: { role: 'STAFF', mode: 'REMOVED' },
    });
  });

  it('wipes the personal data of an account with history and keeps the row', async () => {
    prismaMock.user.findUnique.mockResolvedValue(account({ _count: { ...NONE, auditLogs: 3 } }));
    expect(await deleteStaffAccount('u-1', 'owner')).toEqual({ mode: 'ANONYMIZED' });
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
    expect(prismaMock.address.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u-1' } });
    const { data } = prismaMock.user.update.mock.calls[0][0];
    expect(data).toMatchObject({
      name: DELETED_NAME, username: `${DELETED_USERNAME_PREFIX}u-1`, email: null, phone: null, address: null,
      isActive: false, tokenVersion: { increment: 1 },
    });
    expect(data.password).toMatch(/^\$2[aby]\$12\$/); // a fresh random bcrypt hash
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0][0].metadata).toEqual({ role: 'STAFF', mode: 'ANONYMIZED' });
  });

  it('refuses an active account, your own account, a customer, a missing or an already deleted account', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(account({ isActive: true }));
    await expect(deleteStaffAccount('u-1', 'owner')).rejects.toMatchObject({ statusCode: 409 });
    prismaMock.user.findUnique.mockResolvedValueOnce(account({ id: 'owner' }));
    await expect(deleteStaffAccount('owner', 'owner')).rejects.toMatchObject({ statusCode: 400 });
    prismaMock.user.findUnique.mockResolvedValueOnce(account({ role: 'CUSTOMER' }));
    await expect(deleteStaffAccount('u-1', 'owner')).rejects.toMatchObject({ statusCode: 400 });
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    await expect(deleteStaffAccount('u-1', 'owner')).rejects.toMatchObject({ statusCode: 404 });
    prismaMock.user.findUnique.mockResolvedValueOnce(account({ username: `${DELETED_USERNAME_PREFIX}u-1` }));
    await expect(deleteStaffAccount('u-1', 'owner')).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });
});
