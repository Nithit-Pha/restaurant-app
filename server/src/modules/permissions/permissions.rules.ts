// What Staff may do (Step 3e). The owner (Super Admin) may always do everything.
// Pure, so it is unit-tested; stored as JSON in the Setting table.

export const PERMISSIONS = {
  /** Make, change, send, cancel and close purchase orders. */
  'orders.purchase': false,
  /** Add and change suppliers and ingredients (supplier, pack, levels). */
  'suppliers.edit': false,
  /** Record deliveries of sent orders. */
  'deliveries.receive': true,
  /** Stock in (without price), count and waste. */
  'stock.moves': true,
  /** Enter purchase prices (deliveries and priced stock in): makes Finance expenses. */
  'prices.enter': false,
} as const;

export type Permission = keyof typeof PERMISSIONS;
export type PermissionSet = Record<Permission, boolean>;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[];

/** Stored JSON → full set: defaults for anything missing, unknown keys ignored. */
export function parsePermissions(json: string | null | undefined): PermissionSet {
  let stored: Record<string, unknown> = {};
  try {
    const parsed = json ? JSON.parse(json) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) stored = parsed;
  } catch {
    // broken JSON: defaults
  }
  return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, typeof stored[k] === 'boolean' ? stored[k] : PERMISSIONS[k]])) as PermissionSet;
}

/** May this role do it? Owner: always. Staff: as set. Anyone else: never. */
export function can(role: string | undefined, staff: PermissionSet, permission: Permission): boolean {
  if (role === 'SUPER_ADMIN') return true;
  if (role === 'STAFF') return staff[permission];
  return false;
}

/** What one role may do, for the client to show or hide buttons. */
export const permissionsFor = (role: string | undefined, staff: PermissionSet): PermissionSet =>
  Object.fromEntries(PERMISSION_KEYS.map((k) => [k, can(role, staff, k)])) as PermissionSet;
