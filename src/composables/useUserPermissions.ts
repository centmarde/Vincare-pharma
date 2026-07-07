import { ref, computed, watch } from 'vue'
import { useAuthUserStore } from '@/stores/authUser'
import { useUserPagesStore } from '@/stores/pages'
import {
  navigationConfig,
  isNavigationItem,
  type NavigationGroup,
  type NavigationChild,
} from '@/utils/navigation'

export const useUserPermissions = () => {
  const authStore = useAuthUserStore()
  const pagesStore = useUserPagesStore()

  const userAccessiblePages = ref<string[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Get current user's role ID
  const userRoleId = computed(
    () => authStore.userData?.role_id || authStore.userData?.user_metadata?.role,
  )

  // Fetch accessible pages for the current user's role
  const fetchUserAccessiblePages = async () => {
    if (!userRoleId.value) {
      userAccessiblePages.value = []
      return
    }

    isLoading.value = true
    error.value = null

    try {
      const rolePages = await pagesStore.fetchRolePagesByRoleId(userRoleId.value)
      userAccessiblePages.value = rolePages
        .map((rolePage) => rolePage.pages)
        .filter(Boolean) as string[]
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch user permissions'
      userAccessiblePages.value = []
    } finally {
      isLoading.value = false
    }
  }

  // Check if user has access to a specific route
  const hasAccessToRoute = (route: string): boolean => {
    // If no role ID, no access to any route
    if (!userRoleId.value) {
      return false
    }

    // Always allow access to account pages (base user functionality)
    if (route.startsWith('/account/')) {
      return true
    }

    return userAccessiblePages.value.includes(route)
  }

  // Check if user has access to a child (leaf item, or a sub-group with at
  // least one accessible item inside it).
  const hasAccessToChild = (child: NavigationChild): boolean => {
    if (isNavigationItem(child)) return hasAccessToRoute(child.route)
    return child.children.some((item) => hasAccessToRoute(item.route))
  }

  // Check if user has access to any route in a group (recurses into nested sub-groups)
  const hasAccessToGroup = (group: NavigationGroup): boolean => {
    // If no role ID, no access
    if (!userRoleId.value) {
      return false
    }

    return group.children.some((child) => hasAccessToChild(child))
  }

  // Filter a list of children (leaf items and/or sub-groups) down to what
  // this role can see — recursing one level into sub-groups and dropping
  // any sub-group left with zero accessible items.
  const getFilteredNavigationItems = (children: NavigationChild[]): NavigationChild[] => {
    return children
      .map((child): NavigationChild | null => {
        if (isNavigationItem(child)) {
          return hasAccessToRoute(child.route) ? child : null
        }
        const filteredItems = child.children.filter((item) => hasAccessToRoute(item.route))
        if (filteredItems.length === 0) return null
        // A sub-group with a `route` collapses to a SINGLE link (its children are
        // surfaced as v-tabs inside the view, not as separate sidebar entries).
        // Land on its own route if the user can see it, else the first accessible
        // tab; carry every accessible tab route as activeRoutes so the sidebar
        // keeps the section highlighted/expanded while on any of its tabs.
        if (child.route) {
          return {
            title: child.title,
            icon: child.icon,
            permission: child.permission,
            route: hasAccessToRoute(child.route) ? child.route : filteredItems[0].route,
            activeRoutes: filteredItems.map((item) => item.route),
          }
        }
        return { ...child, children: filteredItems }
      })
      .filter((child): child is NavigationChild => child !== null)
  }

  // Filter navigation groups based on user permissions
  const getFilteredNavigationGroups = (): NavigationGroup[] => {
    if (!userRoleId.value) {
      // If no role, return empty array (no navigation items)
      return []
    }

    return navigationConfig
      .map((group) => ({
        ...group,
        children: getFilteredNavigationItems(group.children),
      }))
      .filter((group) => group.children.length > 0) // Only show groups that have accessible children
  }

  // Watch for role changes and refetch permissions
  watch(
    () => userRoleId.value,
    (newRoleId) => {
      if (newRoleId) {
        fetchUserAccessiblePages()
      } else {
        userAccessiblePages.value = []
      }
    },
    { immediate: true },
  )

  return {
    userAccessiblePages,
    isLoading,
    error,
    userRoleId,
    hasAccessToRoute,
    hasAccessToGroup,
    getFilteredNavigationItems,
    getFilteredNavigationGroups,
    fetchUserAccessiblePages,
  }
}
