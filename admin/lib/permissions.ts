/**
 * Frontend mirror of the backend permission catalog (backend/src/lib/permissions.ts).
 * Used to render the delegation UI and gate navigation/controls.
 */

export type Permission =
  | 'products.manage'
  | 'categories.manage'
  | 'orders.manage'
  | 'inventory.manage'
  | 'coupons.manage'
  | 'content.manage'
  | 'customers.manage'
  | 'analytics.view'
  | 'notifications.manage'
  | 'advertisements.manage'
  | 'staff.manage'
  | 'settings.manage';

export const OWNER_ONLY_PERMISSIONS: Permission[] = [
  'advertisements.manage',
  'staff.manage',
  'settings.manage',
];

/** Permissions the owner can delegate to an employee, with display labels. */
export const DELEGATABLE_PERMISSIONS: { key: Permission; label: string; description: string }[] = [
  { key: 'products.manage', label: 'Products', description: 'Create, edit, and delete products' },
  { key: 'categories.manage', label: 'Categories', description: 'Manage categories and subcategories' },
  { key: 'orders.manage', label: 'Orders', description: 'View and update orders, assign staff' },
  { key: 'inventory.manage', label: 'Inventory', description: 'View stock levels and reorder alerts' },
  { key: 'coupons.manage', label: 'Coupons', description: 'Create and manage discount coupons' },
  { key: 'content.manage', label: 'Content & Homepage', description: 'Edit CMS pages and homepage sections' },
  { key: 'customers.manage', label: 'Customers', description: 'View customers, block/unblock' },
  { key: 'analytics.view', label: 'Analytics & Dashboard', description: 'View revenue, metrics, and alerts' },
  { key: 'notifications.manage', label: 'Notifications', description: 'View and resend notification logs' },
];

export function isOwnerRole(role: string | undefined): boolean {
  const r = role?.toUpperCase();
  return r === 'OWNER' || r === 'ADMIN';
}

/** Owner holds everything; staff hold only what was granted. */
export function can(
  role: string | undefined,
  permissions: string[] | undefined,
  required: Permission
): boolean {
  if (isOwnerRole(role)) return true;
  if (OWNER_ONLY_PERMISSIONS.includes(required)) return false;
  return (permissions ?? []).includes(required);
}
