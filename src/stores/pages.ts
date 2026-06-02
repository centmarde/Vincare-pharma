import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'

// Type definitions
export type RolePage = {
  id: number
  created_at: string
  role_id: number | null
  pages: string | null
}

export type RolePageWithRole = RolePage & {
  roles?: {
    id: number
    title: string | null
  }
}

export type CreateRolePageData = {
  role_id: number
  pages: string
}

export type UpdateRolePageData = {
  role_id?: number
  pages?: string
}

export const useUserPagesStore = defineStore('userPages', () => {
  const toast = useToast()

  // State
  const rolePages = ref<RolePage[]>([])
  const rolePagesWithRoles = ref<RolePageWithRole[]>([])
  const currentRolePage = ref<RolePage | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Actions
  const fetchRolePages = async () => {
    loading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('role_pages')
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      rolePages.value = data || []
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch role pages'
      toast.error('Failed to fetch role pages')
    } finally {
      loading.value = false
    }
  }

  const fetchRolePagesWithRoles = async () => {
    loading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('role_pages')
        .select('*, roles:role_id(id, title)')
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      rolePagesWithRoles.value = data || []
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch role pages with roles'
      toast.error('Failed to fetch role pages with roles')
    } finally {
      loading.value = false
    }
  }

  const fetchRolePageById = async (id: number) => {
    loading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('role_pages')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError

      currentRolePage.value = data
      return data
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch role page'
      toast.error('Failed to fetch role page')
      return null
    } finally {
      loading.value = false
    }
  }

  const fetchRolePagesByRoleId = async (roleId: number) => {
    loading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('role_pages')
        .select('*')
        .eq('role_id', roleId)
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      return data || []
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch role pages by role ID'
      toast.error('Failed to fetch role pages by role ID')
      return []
    } finally {
      loading.value = false
    }
  }

  const createRolePage = async (rolePageData: CreateRolePageData, silent = false) => {
    loading.value = true
    error.value = null

    try {
      const { data, error: createError } = await supabase
        .from('role_pages')
        .insert([rolePageData])
        .select()
        .single()

      if (createError) throw createError

      rolePages.value.unshift(data)
      if (!silent) {
        toast.success('Role page created successfully')
      }
      return data
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to create role page'
      if (!silent) {
        toast.error('Failed to create role page')
      }
      return null
    } finally {
      loading.value = false
    }
  }

  const updateRolePage = async (id: number, updateData: UpdateRolePageData) => {
    loading.value = true
    error.value = null

    try {
      const { data, error: updateError } = await supabase
        .from('role_pages')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (updateError) throw updateError

      // Update in local state
      const index = rolePages.value.findIndex(rolePage => rolePage.id === id)
      if (index !== -1) {
        rolePages.value[index] = data
      }

      if (currentRolePage.value?.id === id) {
        currentRolePage.value = data
      }

      toast.success('Role page updated successfully')
      return data
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to update role page'
      toast.error('Failed to update role page')
      return null
    } finally {
      loading.value = false
    }
  }

  const deleteRolePage = async (id: number) => {
    loading.value = true
    error.value = null

    try {
      const { error: deleteError } = await supabase
        .from('role_pages')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError

      // Remove from local state
      rolePages.value = rolePages.value.filter(rolePage => rolePage.id !== id)
      rolePagesWithRoles.value = rolePagesWithRoles.value.filter(rolePage => rolePage.id !== id)

      if (currentRolePage.value?.id === id) {
        currentRolePage.value = null
      }

      toast.success('Role page deleted successfully')
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to delete role page'
      toast.error('Failed to delete role page')
      return false
    } finally {
      loading.value = false
    }
  }

  const deleteRolePagesByRoleId = async (roleId: number, silent = false) => {
    loading.value = true
    error.value = null

    try {
      const { error: deleteError } = await supabase
        .from('role_pages')
        .delete()
        .eq('role_id', roleId)

      if (deleteError) throw deleteError

      // Remove from local state
      rolePages.value = rolePages.value.filter(rolePage => rolePage.role_id !== roleId)
      rolePagesWithRoles.value = rolePagesWithRoles.value.filter(rolePage => rolePage.role_id !== roleId)

      if (!silent) {
        toast.success('Role pages deleted successfully')
      }
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to delete role pages'
      if (!silent) {
        toast.error('Failed to delete role pages')
      }
      return false
    } finally {
      loading.value = false
    }
  }

  const clearError = () => {
    error.value = null
  }

  const clearCurrentRolePage = () => {
    currentRolePage.value = null
  }

  const clearRolePages = () => {
    rolePages.value = []
    rolePagesWithRoles.value = []
  }

  return {
    // State
    rolePages,
    rolePagesWithRoles,
    currentRolePage,
    loading,
    error,

    // Actions
    fetchRolePages,
    fetchRolePagesWithRoles,
    fetchRolePageById,
    fetchRolePagesByRoleId,
    createRolePage,
    updateRolePage,
    deleteRolePage,
    deleteRolePagesByRoleId,
    clearError,
    clearCurrentRolePage,
    clearRolePages
  }
})
