import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'

// Type definitions
export type Role = {
  id: number
  created_at: string
  title: string | null
}

export type CreateRoleData = {
  title: string
}

export type UpdateRoleData = {
  title?: string
}

export type RoleWithPages = Role & {
  role_pages?: {
    id: number
    pages: string | null
  }[]
}

export const useUserRolesStore = defineStore('userRoles', () => {
  const toast = useToast()

  // State
  const roles = ref<Role[]>([])
  const rolesWithPages = ref<RoleWithPages[]>([])
  const currentRole = ref<Role | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Actions
  const fetchRoles = async () => {
    loading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('roles')
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      roles.value = data || []
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch roles'
      toast.error('Failed to fetch roles')
    } finally {
      loading.value = false
    }
  }

  const fetchRoleById = async (id: number) => {
    loading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('roles')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError

      currentRole.value = data
      return data
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch role'
      toast.error('Failed to fetch role')
      return null
    } finally {
      loading.value = false
    }
  }

  const fetchRolesWithPages = async () => {
    loading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('roles')
        .select('*, role_pages(id, pages)')
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      rolesWithPages.value = data || []
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch roles with pages'
      toast.error('Failed to fetch roles with pages')
    } finally {
      loading.value = false
    }
  }

  const fetchRoleWithPagesById = async (id: number) => {
    loading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('roles')
        .select('*, role_pages(id, pages)')
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError

      return data
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch role with pages'
      toast.error('Failed to fetch role with pages')
      return null
    } finally {
      loading.value = false
    }
  }

  const createRole = async (roleData: CreateRoleData, silent = false) => {
    loading.value = true
    error.value = null

    try {
      const { data, error: createError } = await supabase
        .from('roles')
        .insert([roleData])
        .select()
        .single()

      if (createError) throw createError

      roles.value.unshift(data)
      if (!silent) {
        toast.success('Role created successfully')
      }
      return data
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to create role'
      if (!silent) {
        toast.error('Failed to create role')
      }
      return null
    } finally {
      loading.value = false
    }
  }

  const updateRole = async (id: number, updateData: UpdateRoleData, silent = false) => {
    loading.value = true
    error.value = null

    try {
      const { data, error: updateError } = await supabase
        .from('roles')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (updateError) throw updateError

      // Update in local state
      const index = roles.value.findIndex(role => role.id === id)
      if (index !== -1) {
        roles.value[index] = data
      }

      if (currentRole.value?.id === id) {
        currentRole.value = data
      }

      if (!silent) {
        toast.success('Role updated successfully')
      }
      return data
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to update role'
      if (!silent) {
        toast.error('Failed to update role')
      }
      return null
    } finally {
      loading.value = false
    }
  }

  const deleteRole = async (id: number) => {
    loading.value = true
    error.value = null

    try {
      const { error: deleteError } = await supabase
        .from('roles')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError

      // Remove from local state
      roles.value = roles.value.filter(role => role.id !== id)

      if (currentRole.value?.id === id) {
        currentRole.value = null
      }

      toast.success('Role deleted successfully')
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to delete role'
      toast.error('Failed to delete role')
      return false
    } finally {
      loading.value = false
    }
  }

  const clearError = () => {
    error.value = null
  }

  const clearCurrentRole = () => {
    currentRole.value = null
  }

  const clearRolesWithPages = () => {
    rolesWithPages.value = []
  }

  return {
    // State
    roles,
    rolesWithPages,
    currentRole,
    loading,
    error,

    // Actions
    fetchRoles,
    fetchRoleById,
    fetchRolesWithPages,
    fetchRoleWithPagesById,
    createRole,
    updateRole,
    deleteRole,
    clearError,
    clearCurrentRole,
    clearRolesWithPages
  }
})
