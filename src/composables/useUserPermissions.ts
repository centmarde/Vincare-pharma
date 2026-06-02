import { ref, computed, watch } from 'vue'
import { useAuthUserStore } from '@/stores/authUser'
import { useUserPagesStore } from '@/stores/pages'
import { navigationConfig, type NavigationGroup, type NavigationItem } from '@/utils/navigation'

export const useUserPermissions = () => {
  const authStore = useAuthUserStore()
  const pagesStore = useUserPagesStore()

  const userAccessiblePages = ref<string[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Get current user's role ID
  const userRoleId = computed(() => authStore.userData?.role_id || authStore.userData?.user_metadata?.role)

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
      userAccessiblePages.value = rolePages.map(rolePage => rolePage.pages).filter(Boolean) as string[]
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

  // Check if user has access to any route in a group
  const hasAccessToGroup = (group: NavigationGroup): boolean => {
    // If no role ID, no access
    if (!userRoleId.value) {
      return false
    }

    // Check if any child in the group is accessible
    return group.children.some(child => hasAccessToRoute(child.route))
  }

  // Filter navigation items based on user permissions
  const getFilteredNavigationItems = (items: NavigationItem[]): NavigationItem[] => {
    return items.filter(item => hasAccessToRoute(item.route))
  }

  // Filter navigation groups based on user permissions
  const getFilteredNavigationGroups = (): NavigationGroup[] => {
    if (!userRoleId.value) {
      // If no role, return empty array (no navigation items)
      return []
    }

    return navigationConfig
      .map(group => ({
        ...group,
        children: getFilteredNavigationItems(group.children)
      }))
      .filter(group => group.children.length > 0) // Only show groups that have accessible children
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
    { immediate: true }
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
    fetchUserAccessiblePages
  }
}
