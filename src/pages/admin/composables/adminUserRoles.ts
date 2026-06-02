import { ref, computed, onMounted } from 'vue'
import { useUserRolesStore, type Role, type CreateRoleData, type UpdateRoleData } from '@/stores/roles'
import { useUserPagesStore } from '@/stores/pages'
import { navigationConfig } from '@/utils/navigation'
import { useToast } from 'vue-toastification'

export function useAdminUserRoles() {
  const userRolesStore = useUserRolesStore()
  const userPagesStore = useUserPagesStore()
  const toast = useToast()

  // Local state for UI
  const isDialogOpen = ref(false)
  const isDeleteDialogOpen = ref(false)
  const isEditing = ref(false)
  const selectedRole = ref<Role | null>(null)
  const searchQuery = ref('')

  // Form data
  const formData = ref<CreateRoleData>({
    title: ''
  })

  // Computed properties
  const filteredRoles = computed(() => {
    if (!searchQuery.value) return userRolesStore.roles

    return userRolesStore.roles.filter(role =>
      role.title?.toLowerCase().includes(searchQuery.value.toLowerCase())
    )
  })

  const isFormValid = computed(() => {
    return formData.value.title.trim().length > 0
  })

  // Actions
  const openCreateDialog = () => {
    isEditing.value = false
    selectedRole.value = null
    formData.value = { title: '' }
    isDialogOpen.value = true
  }


  const openEditDialog = (role: Role) => {
    isEditing.value = true
    selectedRole.value = role
    formData.value = { title: role.title || '' }
    isDialogOpen.value = true
  }

  const openDeleteDialog = (role: Role) => {
    selectedRole.value = role
    isDeleteDialogOpen.value = true
  }

  const closeDialog = () => {
    isDialogOpen.value = false
    isDeleteDialogOpen.value = false
    selectedRole.value = null
    formData.value = { title: '' }
    userRolesStore.clearError()
  }

  const handleSubmit = async (selectedPermissions: string[] = []) => {
    if (!isFormValid.value) return

    let success = false
    let targetRoleId: number | null = null
    const hasPermissions = selectedPermissions.length > 0

    if (isEditing.value && selectedRole.value) {
      // Update existing role (silent if permissions are being saved)
      const updateData: UpdateRoleData = { title: formData.value.title }
      const result = await userRolesStore.updateRole(selectedRole.value.id, updateData, hasPermissions)
      success = !!result
      targetRoleId = selectedRole.value.id
    } else {
      // Create new role (silent if permissions are being saved)
      const createdRole = await userRolesStore.createRole(formData.value, hasPermissions)
      success = !!createdRole
      targetRoleId = createdRole?.id || null
    }

    // If role operation was successful and we have a role ID, save permissions
    if (success && targetRoleId) {
      try {
        // Convert permissions/routes to routes using navigation config
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

        const routes = selectedPermissions
          .map(permission => {
            // If it's already a route, return it directly
            if (routeSet.has(permission)) {
              return permission
            }
            // Otherwise, map permission to route
            return permissionToRouteMap[permission]
          })
          .filter(Boolean) as string[]

        // For editing, first delete existing role pages (silent mode)
        if (isEditing.value) {
          await userPagesStore.deleteRolePagesByRoleId(targetRoleId, true)
        }

        // Create new role pages for each route (silent mode)
        if (routes.length > 0) {
          const createPromises = routes.map(route =>
            userPagesStore.createRolePage({
              role_id: targetRoleId!,
              pages: route
            }, true)
          )

          await Promise.all(createPromises)
        }

        // Show success message for the complete operation
        if (isEditing.value) {
          toast.success('Role and permissions updated successfully')
        } else {
          toast.success('Role and permissions created successfully')
        }
      } catch (error) {
        console.error('Failed to save role permissions:', error)
        toast.error('Role was saved but failed to update permissions')
      }
    } else if (success) {
      // Role operation successful but no permissions to save
      // The store already showed a toast for the role operation
    }

    if (success) {
      closeDialog()
    }
  }

  const handleDelete = async () => {
    if (!selectedRole.value) return

    const success = await userRolesStore.deleteRole(selectedRole.value.id)

    if (success) {
      closeDialog()
    }
  }

  const refreshRoles = async () => {
    await userRolesStore.fetchRoles()
  }

  // Initialize data on mount
  onMounted(() => {
    refreshRoles()
  })

  return {
    // Store state
    roles: userRolesStore.roles,
    loading: userRolesStore.loading,
    error: userRolesStore.error,

    // Local state
    isDialogOpen,
    isDeleteDialogOpen,
    isEditing,
    selectedRole,
    searchQuery,
    formData,

    // Computed
    filteredRoles,
    isFormValid,

    // Actions
    openCreateDialog,
    openEditDialog,
    openDeleteDialog,
    closeDialog,
    handleSubmit,
    handleDelete,
    refreshRoles,
    clearError: userRolesStore.clearError
  }
}
