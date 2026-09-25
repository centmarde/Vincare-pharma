import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'

// User announcement types following the database schema
export type UserAnnouncementType = {
  id: number
  created_at: string
  user_id: string
  announcement_id: number | null
  is_read: boolean | null
}

type CreateUserAnnouncementData = {
  user_id?: string
  announcement_id?: number | null
  is_read?: boolean
}

type UpdateUserAnnouncementData = {
  user_id?: string
  announcement_id?: number | null
  is_read?: boolean
}

export const useUserAnnouncementsDataStore = defineStore('userAnnouncementsData', () => {
  // States
  const userAnnouncements: Ref<UserAnnouncementType[]> = ref([])
  const currentUserAnnouncement: Ref<UserAnnouncementType | undefined> = ref(undefined)
  const loading = ref(false)
  const loadingMore = ref(false)
  const hasMore = ref(true)
  const currentPage = ref(0)
  const pageSize = ref(12) // Load 12 items per page
  const error: Ref<string> = ref('')

  // Computed properties
  const userAnnouncementsCount = computed(() => userAnnouncements.value.length)
  const hasUserAnnouncements = computed(() => userAnnouncements.value.length > 0)
  const isLoading = computed(() => loading.value)
  const hasError = computed(() => error.value !== '')

  // Number of unread announcements
  const unreadCount = computed(
    () => userAnnouncements.value.filter((item) => item.is_read !== true).length,
  )

  // Number of read announcements
  const readCount = computed(
    () => userAnnouncements.value.filter((item) => item.is_read === true).length,
  )

  // Helper function to handle errors
  const handleError = (err: unknown, defaultMessage: string) => {
    const errorMessage = err instanceof Error ? err.message : defaultMessage
    error.value = errorMessage
  }

  // Clear error state
  const clearError = () => {
    error.value = ''
  }

  // Fetch initial user announcements (first page)
  const fetchUserAnnouncements = async (reset = false) => {
    if (reset) {
      loading.value = true
      userAnnouncements.value = []
      currentPage.value = 0
      hasMore.value = true
    } else {
      loadingMore.value = true
    }
    clearError()

    try {
      const { data, error: fetchError } = await supabase
        .from('user_announcements')
        .select('*')
        .order('created_at', { ascending: false })
        .range(currentPage.value * pageSize.value, (currentPage.value + 1) * pageSize.value - 1)

      if (fetchError) {
        throw fetchError
      }

      const newUserAnnouncements = data || []

      if (reset) {
        userAnnouncements.value = newUserAnnouncements
      } else {
        userAnnouncements.value = [...userAnnouncements.value, ...newUserAnnouncements]
      }

      // Check if we have more data
      hasMore.value = newUserAnnouncements.length === pageSize.value
      if (newUserAnnouncements.length > 0) {
        currentPage.value += 1
      }
    } catch (err) {
      handleError(err, 'Failed to fetch user announcements')
    } finally {
      loading.value = false
      loadingMore.value = false
    }
  }

  // Load more user announcements
  const loadMoreUserAnnouncements = async () => {
    if (!hasMore.value || loadingMore.value) return
    await fetchUserAnnouncements(false)
  }

  // Fetch user announcement by ID
  const fetchUserAnnouncementById = async (id: number) => {
    loading.value = true
    clearError()

    try {
      const { data, error: fetchError } = await supabase
        .from('user_announcements')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchError) {
        throw fetchError
      }

      currentUserAnnouncement.value = data
      return data
    } catch (err) {
      handleError(err, `Failed to fetch user announcement with ID ${id}`)
      return undefined
    } finally {
      loading.value = false
    }
  }

  // Fetch user announcements by user ID
  const fetchUserAnnouncementsByUserId = async (userId: string) => {
    loading.value = true
    clearError()

    try {
      const { data, error: fetchError } = await supabase
        .from('user_announcements')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (fetchError) {
        throw fetchError
      }

      userAnnouncements.value = data || []
    } catch (err) {
      handleError(err, `Failed to fetch user announcements for user ${userId}`)
    } finally {
      loading.value = false
    }
  }

  // Fetch user announcements by announcement ID
  const fetchUserAnnouncementsByAnnouncementId = async (announcementId: number) => {
    loading.value = true
    clearError()

    try {
      const { data, error: fetchError } = await supabase
        .from('user_announcements')
        .select('*')
        .eq('announcement_id', announcementId)
        .order('created_at', { ascending: false })

      if (fetchError) {
        throw fetchError
      }

      userAnnouncements.value = data || []
    } catch (err) {
      handleError(err, `Failed to fetch user announcements for announcement ${announcementId}`)
    } finally {
      loading.value = false
    }
  }

  // Create new user announcement
  const createUserAnnouncement = async (announcementData: CreateUserAnnouncementData) => {
    loading.value = true
    clearError()

    try {
      const { data, error: createError } = await supabase
        .from('user_announcements')
        .insert([announcementData])
        .select()
        .single()

      if (createError) {
        throw createError
      }

      // Add to local state
      userAnnouncements.value.unshift(data)
      return data
    } catch (err) {
      handleError(err, 'Failed to create user announcement')
      return undefined
    } finally {
      loading.value = false
    }
  }

  // Update user announcement
  const updateUserAnnouncement = async (id: number, updateData: UpdateUserAnnouncementData) => {
    loading.value = true
    clearError()

    try {
      const { data, error: updateError } = await supabase
        .from('user_announcements')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (updateError) {
        throw updateError
      }

      // Update local state
      const index = userAnnouncements.value.findIndex((item) => item.id === id)
      if (index !== -1) {
        userAnnouncements.value[index] = data
      }

      // Update current user announcement if it's the same one
      if (currentUserAnnouncement.value?.id === id) {
        currentUserAnnouncement.value = data
      }

      return data
    } catch (err) {
      handleError(err, `Failed to update user announcement with ID ${id}`)
      return undefined
    } finally {
      loading.value = false
    }
  }

  // Mark a user announcement as read
  const markAsRead = async (id: number) => {
    const updated = await updateUserAnnouncement(id, { is_read: true })
    return updated !== undefined
  }

  // Mark a user announcement as unread
  const markAsUnread = async (id: number) => {
    const updated = await updateUserAnnouncement(id, { is_read: false })
    return updated !== undefined
  }

  // Delete user announcement
  const deleteUserAnnouncement = async (id: number) => {
    loading.value = true
    clearError()

    try {
      const { error: deleteError } = await supabase.from('user_announcements').delete().eq('id', id)

      if (deleteError) {
        throw deleteError
      }

      // Remove from local state
      userAnnouncements.value = userAnnouncements.value.filter((item) => item.id !== id)

      // Clear current user announcement if it's the deleted one
      if (currentUserAnnouncement.value?.id === id) {
        currentUserAnnouncement.value = undefined
      }

      return true
    } catch (err) {
      handleError(err, `Failed to delete user announcement with ID ${id}`)
      return false
    } finally {
      loading.value = false
    }
  }

  // Get recent user announcements (last N)
  const getRecentUserAnnouncements = computed(() => {
    return (limit: number = 10) => userAnnouncements.value.slice(0, limit)
  })

  // Get unread user announcements
  const getUnreadUserAnnouncements = computed(() => {
    return userAnnouncements.value.filter((item) => item.is_read !== true)
  })

  // Get read user announcements
  const getReadUserAnnouncements = computed(() => {
    return userAnnouncements.value.filter((item) => item.is_read === true)
  })

  // Clear user announcements state
  const clearUserAnnouncements = () => {
    userAnnouncements.value = []
    currentUserAnnouncement.value = undefined
    clearError()
  }

  // Clear current user announcement
  const clearCurrentUserAnnouncement = () => {
    currentUserAnnouncement.value = undefined
  }

  // Reset store to initial state
  const resetStore = () => {
    userAnnouncements.value = []
    currentUserAnnouncement.value = undefined
    loading.value = false
    loadingMore.value = false
    hasMore.value = true
    currentPage.value = 0
    error.value = ''
  }

  return {
    // State
    userAnnouncements,
    currentUserAnnouncement,
    loading,
    loadingMore,
    hasMore,
    currentPage,
    pageSize,
    error,

    // Computed
    userAnnouncementsCount,
    hasUserAnnouncements,
    isLoading,
    hasError,
    unreadCount,
    readCount,
    getRecentUserAnnouncements,
    getUnreadUserAnnouncements,
    getReadUserAnnouncements,

    // Actions
    fetchUserAnnouncements,
    loadMoreUserAnnouncements,
    fetchUserAnnouncementById,
    fetchUserAnnouncementsByUserId,
    fetchUserAnnouncementsByAnnouncementId,
    createUserAnnouncement,
    updateUserAnnouncement,
    markAsRead,
    markAsUnread,
    deleteUserAnnouncement,
    clearError,
    clearUserAnnouncements,
    clearCurrentUserAnnouncement,
    resetStore,
  }
})
