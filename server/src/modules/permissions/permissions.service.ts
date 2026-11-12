import { prisma } from '../../config/db';
import { audit } from '../../utils/auditLog';
import { can, parsePermissions, type Permission, type PermissionSet } from './permissions.rules';

const KEY = 'STAFF_PERMISSIONS';
const httpError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

let cache: PermissionSet | null = null;

/** What Staff may do (cached; changed only through setStaffPermissions). */
export async function getStaffPermissions(): Promise<PermissionSet> {
  if (!cache) {
    const row = await prisma.setting.findUnique({ where: { key: KEY } });
    cache = parsePermissions(row?.value);
  }
  return cache;
}

export async function setStaffPermissions(patch: Partial<PermissionSet>, actorId: string): Promise<PermissionSet> {
  const before = await getStaffPermissions();
  const next = { ...before, ...patch };
  const value = JSON.stringify(next);
  await prisma.setting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
  cache = next;
  const changed = Object.fromEntries(Object.entries(patch).filter(([k, v]) => before[k as Permission] !== v));
  await audit({ actorId, action: 'UPDATE', entityType: 'SETTING', entityId: KEY, metadata: { changed } });
  return next;
}

/** True when this user may do it. */
export async function actorCan(actor: { role?: string }, permission: Permission): Promise<boolean> {
  return can(actor.role, await getStaffPermissions(), permission);
}

/** Throws 403 when this user may not do it. */
export async function assertCan(actor: { role?: string }, permission: Permission, message: string): Promise<void> {
  if (!(await actorCan(actor, permission))) throw httpError(403, message);
}

/** Tests only. */
export const resetPermissionCache = () => { cache = null; };
