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
