/**
 * Role & permission model.
 *
 * OWNER — the business owner. Implicitly holds every permission, is the
 *   only role that can manage advertisements, staff, and store settings,
 *   and cannot be demoted or deactivated. (Legacy `ADMIN` accounts are
 *   treated as owner-level for backward compatibility.)
 * STAFF — an employee whose capabilities are exactly the permissions the
 *   owner has granted them.
 *
 * Owner-exclusive permissions can never be delegated to STAFF.
 */

export const ROLES = ['OWNER', 'STAFF'] as const;
export type Role = (typeof ROLES)[number];

/** Every capability an owner can delegate or hold. */
export const PERMISSIONS = [
  'products.manage',
  'categories.manage',
  'orders.manage',
  'inventory.manage',
  'coupons.manage',
  'content.manage',
  'customers.manage',
  'analytics.view',
  'notifications.manage',
  // Owner-exclusive — see OWNER_ONLY_PERMISSIONS below.
  'advertisements.manage',
  'staff.manage',
  'settings.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Permissions that belong to the owner alone and can never be granted to
 * an employee. Advertisements control the public face of the store, staff
 * management is how roles are delegated, and settings define the store's
 * identity — all reserved to the owner.
 */
export const OWNER_ONLY_PERMISSIONS: readonly Permission[] = [
  'advertisements.manage',
  'staff.manage',
  'settings.manage',
];

/** Permissions an owner is allowed to delegate to STAFF. */
export const DELEGATABLE_PERMISSIONS: readonly Permission[] = PERMISSIONS.filter(
  (p) => !OWNER_ONLY_PERMISSIONS.includes(p)
);

/** True for OWNER and legacy ADMIN accounts. */
export function isOwnerRole(role: string | undefined): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

/** Normalizes any casing / legacy value to a canonical Role. */
export function normalizeRole(role: string | undefined): Role {
  return isOwnerRole(role?.toUpperCase()) ? 'OWNER' : 'STAFF';
}

/** Parses the JSON permissions column into a validated Permission[]. */
export function parsePermissions(raw: string | null | undefined): Permission[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter((p): p is Permission => PERMISSIONS.includes(p as Permission));
  } catch {
    return [];
  }
}

/**
 * Effective permission check.
 * Owners hold everything; staff hold only what was granted (and can never
 * hold an owner-exclusive permission even if it somehow appears in their list).
 */
export function hasPermission(
  role: string | undefined,
  granted: Permission[],
  required: Permission
): boolean {
  if (isOwnerRole(role)) return true;
  if (OWNER_ONLY_PERMISSIONS.includes(required)) return false;
  return granted.includes(required);
}

/** Drops any owner-only or unknown permissions from a requested grant list. */
export function sanitizeGrant(requested: unknown): Permission[] {
  if (!Array.isArray(requested)) return [];
  return requested.filter(
    (p): p is Permission => DELEGATABLE_PERMISSIONS.includes(p as Permission)
  );
}
