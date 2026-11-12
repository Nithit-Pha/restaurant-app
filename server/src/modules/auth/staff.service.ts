import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../../config/db';
import { audit } from '../../utils/auditLog';

/**
 * Deleted accounts get this username. The username rules (a-z 0-9 . _ -) never
 * allow ':', so nobody can register it or sign in with it.
 */
export const DELETED_USERNAME_PREFIX = 'deleted:';
export const DELETED_NAME = 'Deleted user';

const httpError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

/**
 * Delete a staff/owner account. An account that was never used is removed.
 * An account with history (every sign-in leaves an audit entry, which must
 * keep its author) has its personal data wiped instead, so orders and the
 * audit log show "Deleted user". Only deactivated accounts can be deleted:
 * the owner cannot delete themselves or the last active owner.
 */
export async function deleteStaffAccount(targetId: string, actorId: string): Promise<{ mode: 'REMOVED' | 'ANONYMIZED' }> {
  const user = await prisma.user.findUnique({
    where: { id: targetId },
    select: {
      id: true, username: true, role: true, isActive: true,
      _count: {
        select: {
          orders: true, expenses: true, auditLogs: true, statusChanges: true, confirmedPayments: true,
          confirmedVisits: true, stockMovements: true, purchaseOrdersCreated: true, purchaseOrdersSent: true,
        },
      },
    },
  });
  if (!user || user.username.startsWith(DELETED_USERNAME_PREFIX)) throw httpError(404, 'User not found');
  if (user.role === 'CUSTOMER') throw httpError(400, 'Only staff accounts can be deleted here');
  if (user.id === actorId) throw httpError(400, 'You cannot delete your own account');
  if (user.isActive) throw httpError(409, 'Deactivate the account before deleting it');

  const used = Object.values(user._count).some((n) => n > 0);
  if (!used) {
    await prisma.user.delete({ where: { id: targetId } }); // saved addresses cascade
  } else {
    const unusablePassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
    await prisma.$transaction([
      prisma.address.deleteMany({ where: { userId: targetId } }),
      prisma.user.update({
        where: { id: targetId },
        data: {
          name: DELETED_NAME,
          username: `${DELETED_USERNAME_PREFIX}${targetId}`,
          email: null,
          phone: null,
          address: null,
          password: unusablePassword,
          isActive: false,
          tokenVersion: { increment: 1 },
        },
      }),
    ]);
  }
  const mode = used ? 'ANONYMIZED' : 'REMOVED';
  // No personal data in the entry: the point of deleting is to remove it.
  audit({ actorId, action: 'DELETE', entityType: 'USER', entityId: targetId, metadata: { role: user.role, mode } });
  return { mode };
}
