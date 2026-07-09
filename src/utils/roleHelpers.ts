/**
 * Reusable helpers for role restriction logic.
 * Use these functions wherever you need to check if a role is a system-protected role.
 */

/** IDs of system-protected roles that cannot be edited or deleted. */
export const PROTECTED_ROLE_IDS = [1, 2, 3, 4]

/**
 * Check whether a role ID belongs to a system-protected role.
 * @param roleId - The role's numeric ID.
 * @returns `true` if the role is protected.
 */
export function isProtectedRole(roleId: number | undefined | null): boolean {
  if (roleId === undefined || roleId === null) return false
  return PROTECTED_ROLE_IDS.includes(roleId)
}

/**
 * Convenience wrapper that accepts a role object.
 * @param role - An object that has an `id` property (e.g. `Role`, `Role | null`).
 * @returns `true` if the role exists and its ID is protected.
 */
export function isProtectedRoleObject(role: { id: number } | null | undefined): boolean {
  if (!role) return false
  return isProtectedRole(role.id)
}

/** Role IDs that are allowed to view supplier names on product records. */
export const SUPPLIER_NAME_ACCESS_ROLE_IDS = [1, 2, 4]

/**
 * Check whether the given role is allowed to view supplier names.
 * Supplier names should only be visible to roles with IDs 1 (Super Admin), 2 (Admin), and 4 (Purchasing).
 *
 * @param role - A role object with an `id` property, or a raw numeric role ID.
 * @returns `true` if the role has access to view supplier names.
 *
 * @example
 * ```ts
 * canViewSupplierName(user.role)           // → boolean
 * canViewSupplierName({ id: 1 })            // → true
 * canViewSupplierName(3)                    // → false
 * ```
 */
export function canViewSupplierName(
  role: { id: number } | null | undefined | number,
): boolean {
  if (role === undefined || role === null) return false
  const id = typeof role === 'number' ? role : role.id
  return SUPPLIER_NAME_ACCESS_ROLE_IDS.includes(id)
}
