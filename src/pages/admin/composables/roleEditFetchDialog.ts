import { ref, watch } from 'vue'
import { useUserRolesStore } from '@/stores/roles'
import { useUserPagesStore } from '@/stores/pages'
import { navigationConfig } from '@/utils/navigation'

export function useRoleEditFetchDialog() {
  const rolesStore = useUserRolesStore()
  const pagesStore = useUserPagesStore()

  // State to track current role's permissions
  const currentRolePermissions = ref<string[]>([])
  const loading = ref(false)

  /**
   * Fetch role's current permissions from the database
   * @param roleId - The ID of the role to fetch permissions for
   */
  const fetchRolePermissions = async (roleId: number) => {
    if (!roleId) {
      currentRolePermissions.value = []
      return
    }

    loading.value = true
    try {
      // Fetch role pages for this specific role
      const rolePages = await pagesStore.fetchRolePagesByRoleId(roleId)

      if (rolePages && rolePages.length > 0) {
        // Extract pages (routes) from role_pages and convert to permissions
        // The pages field contains the route like '/admin/user-management'
        // We need to map these routes back to permissions
        const routes = rolePages
          .map(rolePage => rolePage.pages)
          .filter(Boolean) as string[]

        // Convert routes back to permissions using navigation mapping
        currentRolePermissions.value = routesToPermissions(routes)
      } else {
        currentRolePermissions.value = []
      }
    } catch (error) {
      console.error('Failed to fetch role permissions:', error)
      currentRolePermissions.value = []
    } finally {
      loading.value = false
    }
  }

  /**
   * Convert routes back to permissions/routes for selection
   * This maps the stored routes to their corresponding permission keys OR routes using navigation config
   */
  const routesToPermissions = (routes: string[]): string[] => {
    const routeToPermissionMap: Record<string, string> = {}

    // Build mapping from navigation config
    navigationConfig.forEach(group => {
      group.children.forEach(item => {
        if (item.route) {
          // Use permission if available, otherwise use the route itself
          routeToPermissionMap[item.route] = item.permission || item.route
        }
      })
    })

    return routes
      .map(route => routeToPermissionMap[route])
      .filter(Boolean) as string[]
  }

  /**
   * Convert permissions/routes to routes for saving
   * This maps permission keys to their corresponding routes OR uses routes directly using navigation config
   */
  const permissionsToRoutes = (permissions: string[]): string[] => {
    const permissionToRouteMap: Record<string, string> = {}
    const routeSet = new Set<string>()

    // Build mapping from navigation config and collect routes
    navigationConfig.forEach(group => {
      group.children.forEach(item => {
        if (item.route) {
          routeSet.add(item.route)
          if (item.permission) {
            permissionToRouteMap[item.permission] = item.route
          }
        }
      })
    })

    return permissions
      .map(permission => {
        // If it's already a route, return it directly
        if (routeSet.has(permission)) {
          return permission
        }
        // Otherwise, map permission to route
        return permissionToRouteMap[permission]
      })
      .filter(Boolean) as string[]
  }

  /**
   * Save role permissions to the database
   * @param roleId - The ID of the role
   * @param selectedPermissions - Array of permission keys
   */
  const saveRolePermissions = async (roleId: number, selectedPermissions: string[]) => {
    if (!roleId) return false

    loading.value = true
    try {
      // First, delete existing role pages for this role
      await pagesStore.deleteRolePagesByRoleId(roleId)

      // Convert permissions to routes
      const routes = permissionsToRoutes(selectedPermissions)

      // Create new role pages for each route
      const createPromises = routes.map(route =>
        pagesStore.createRolePage({
          role_id: roleId,
          pages: route
        })
      )

      await Promise.all(createPromises)

      // Update local state
      currentRolePermissions.value = selectedPermissions

      return true
    } catch (error) {
      console.error('Failed to save role permissions:', error)
      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * Check if a specific permission is currently granted to the role
   * @param permission - The permission key to check
   */
  const hasPermission = (permission: string): boolean => {
    return currentRolePermissions.value.includes(permission)
  }

  /**
   * Clear current role permissions state
   */
  const clearPermissions = () => {
    currentRolePermissions.value = []
  }

  return {
    // State
    currentRolePermissions,
    loading,

    // Actions
    fetchRolePermissions,
    saveRolePermissions,
    hasPermission,
    clearPermissions,
    routesToPermissions,
    permissionsToRoutes
  }
}
