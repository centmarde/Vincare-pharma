<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useAuthUserStore } from '@/stores/authUser'
import { useUserRolesStore } from '@/stores/roles'
import { useDisplay } from 'vuetify'
import { useToast } from 'vue-toastification'
import DeleteUserDialog from '@/pages/admin/components/dialogs/DeleteUserDialog.vue'
import EditUserDialog from '@/pages/admin/components/dialogs/EditUserDialog.vue'
import UserDetailsDialog from '@/pages/admin/components/dialogs/UserDetailsDialog.vue'

import { formatDate, getErrorMessage, getRoleTitle, getRoleColor } from '@/utils/helpers'

interface User {
  id: string
  email?: string
  created_at?: string
  user_metadata?: Record<string, any>
  app_metadata?: Record<string, any>
  full_name?: string
  role_id?: number
}

// Composables
const authStore = useAuthUserStore()
const rolesStore = useUserRolesStore()
const { mobile } = useDisplay()
const toast = useToast()

// Reactive data
const loading = ref(false)
const search = ref('')
const userDialog = ref(false)
const editDialog = ref(false)
const selectedUser = ref<User | null>(null)
const editingUser = ref<User | null>(null)
const studentEventStatusMap = ref<Record<string, any[]>>({}) // userId -> events array
const deleteDialog = ref(false)
const userToDelete = ref<User | null>(null)

// Computed properties
const filteredUsers = computed(() => {
  if (!authStore.users) return []

  if (!search.value) return authStore.users

  const searchTerm = search.value.toLowerCase()
  return authStore.users.filter(
    (user) =>
      user.full_name?.toLowerCase().includes(searchTerm) ||
      user.email?.toLowerCase().includes(searchTerm) ||
      getRoleTitle(user.role_id, rolesStore.roles).toLowerCase().includes(searchTerm),
  )
})

// Methods
const fetchUsers = async () => {
  loading.value = true
  try {
    const result = await authStore.getAllUsers()

    if (result.error) {
      toast.error('Failed to fetch users: ' + getErrorMessage(result.error))
      console.error('Error fetching users:', result.error)
      return
    }

    // Users are now stored in authStore.users reactively
    if (result.users) {
      // toast.success(`Loaded ${result.users.length} users`)
    }
  } catch (error) {
    toast.error('An unexpected error occurred while fetching users')
    console.error('Unexpected error:', error)
  } finally {
    loading.value = false
  }
}
const viewUser = (user: User) => {
  selectedUser.value = user
  userDialog.value = true
}
const editUser = (user: User) => {
  editingUser.value = user
  editDialog.value = true
}

const deleteUser = (user: User) => {
  userToDelete.value = user
  deleteDialog.value = true
}

// Event handlers
const onUserUpdated = (updatedUser: User) => {
  // The store already updates the users array automatically
  console.log('User updated:', updatedUser)
}

const onUserDeleted = (deletedUserId: string) => {
  // The store already removes the user from the users array automatically
  console.log('User deleted:', deletedUserId)
}

// Lifecycle
onMounted(async () => {
  await rolesStore.fetchRoles()
  await fetchUsers()
})

// Table headers for desktop view
const userTableHeaders = [
  {
    title: 'User',
    key: 'full_name',
    sortable: true,
  },
  {
    title: 'Role',
    key: 'role_id',
    sortable: true,
  },
  {
    title: 'Created',
    key: 'created_at',
    sortable: true,
  },
  {
    title: 'Actions',
    key: 'actions',
    sortable: false,
    align: 'end' as const,
  },
]
</script>

<template>
  <v-container fluid class="pa-2 bg-surface-variant rounded align-start">
    <v-card class="mx-auto w-100 pa-0" rounded="lg" elevation="1">
      <v-card-title class="pa-5 d-flex justify-space-between align-center">
        <div>
          <h3>User Management</h3>
          <p class="text-subtitle-1 text-grey">Manage all system users</p>
        </div>
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-5">
        <!-- Search Field -->
        <v-row class="mb-4">
          <v-col cols="12" md="6">
            <v-text-field
              v-model="search"
              prepend-inner-icon="mdi-magnify"
              label="Search users..."
              single-line
              hide-details
              clearable
              variant="outlined"
            />
          </v-col>
        </v-row>

        <!-- Loading State -->
        <div v-if="loading" class="text-center pa-8">
          <v-progress-circular indeterminate color="primary" size="64" />
          <p class="text-h6 mt-4">Loading users...</p>
        </div>

        <!-- No Users State -->
        <div v-else-if="filteredUsers.length === 0" class="text-center pa-8">
          <v-icon size="64" color="grey">mdi-account-off</v-icon>
          <p class="text-h6 mt-4">No users found</p>
          <p class="text-body-2 text-grey">
            {{
              search
                ? 'No users match your search criteria.'
                : 'There are no users in the system yet.'
            }}
          </p>
        </div>

        <!-- Desktop: Data Table View -->
        <v-data-table
          v-if="!mobile"
          :headers="userTableHeaders"
          :items="filteredUsers"
          :search="search"
          item-value="id"
          class="elevation-1"
          hide-default-footer
          items-per-page="-1"
          loading-text="Loading users..."
          no-data-text="No users found."
        >
          <!-- Avatar + User Info Column -->
          <template v-slot:item.full_name="{ item }">
            <div class="d-flex align-center">
              <v-avatar :color="getRoleColor(item.role_id)" size="36" class="me-3">
                <v-icon color="white" size="small">mdi-account</v-icon>
              </v-avatar>
              <div>
                <div class="font-weight-medium">
                  {{ item.full_name || 'Unknown User' }}
                </div>
                <div class="text-body-2 text-grey">
                  {{ item.email }}
                </div>
              </div>
            </div>
          </template>

          <!-- Role Column -->
          <template v-slot:item.role_id="{ item }">
            <v-chip :color="getRoleColor(item.role_id)" variant="tonal" size="small">
              {{ getRoleTitle(item.role_id, rolesStore.roles) }}
            </v-chip>
          </template>

          <!-- Created Column -->
          <template v-slot:item.created_at="{ item }">
            {{ formatDate(item.created_at) }}
          </template>

          <!-- Actions Column -->
          <template v-slot:item.actions="{ item }">
            <v-btn icon variant="text" size="small" @click="viewUser(item)" title="View">
              <v-icon>mdi-eye</v-icon>
            </v-btn>
            <v-btn icon variant="text" size="small" color="primary" @click="editUser(item)" title="Edit">
              <v-icon>mdi-pencil</v-icon>
            </v-btn>
            <v-btn icon variant="text" size="small" color="error" @click="deleteUser(item)" title="Delete">
              <v-icon>mdi-delete</v-icon>
            </v-btn>
          </template>
        </v-data-table>

        <!-- Mobile: Cards Grid View -->
        <v-row v-else>
          <v-col v-for="user in filteredUsers" :key="user.id" cols="12" sm="6" lg="4" xl="3">
            <v-card class="user-card" variant="outlined" hover :elevation="2">
              <v-card-title class="d-flex align-center pa-4">
                <v-avatar :color="getRoleColor(user.role_id)" size="40" class="me-3">
                  <v-icon color="white">mdi-account</v-icon>
                </v-avatar>
                <div class="flex-grow-1">
                  <div class="text-h6 text-truncate">
                    {{ user.full_name || 'Unknown User' }}
                  </div>
                  <div class="text-body-2 text-grey text-truncate">
                    {{ user.email }}
                  </div>
                </div>
              </v-card-title>

              <v-card-text class="pt-0">
                <v-row dense>
                  <v-col cols="12" class="pb-2">
                    <v-chip :color="getRoleColor(user.role_id)" variant="tonal" size="small" block>
                      {{ getRoleTitle(user.role_id, rolesStore.roles) }}
                    </v-chip>
                  </v-col>

                  <v-col cols="12">
                    <div class="d-flex align-center">
                      <v-icon size="16" color="grey" class="me-2">mdi-calendar</v-icon>
                      <span class="text-body-2 text-grey">
                        Created: {{ formatDate(user.created_at) }}
                      </span>
                    </div>
                  </v-col>
                </v-row>
              </v-card-text>

              <v-card-actions class="pt-0 px-4 pb-4">
                <v-btn variant="text" size="small" @click="viewUser(user)" prepend-icon="mdi-eye">
                  View
                </v-btn>

                <v-btn
                  variant="text"
                  size="small"
                  color="primary"
                  @click="editUser(user)"
                  prepend-icon="mdi-pencil"
                >
                  Edit
                </v-btn>

                <v-btn
                  variant="text"
                  size="small"
                  color="error"
                  @click="deleteUser(user)"
                  prepend-icon="mdi-delete"
                >
                  Delete
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-col>
        </v-row>
      </v-card-text>

      <!-- User Details Dialog -->
      <UserDetailsDialog v-model="userDialog" :user="selectedUser" />

      <!-- Edit User Dialog -->
      <EditUserDialog v-model="editDialog" :user="editingUser" @user-updated="onUserUpdated" />

      <!-- Delete User Dialog -->
      <DeleteUserDialog v-model="deleteDialog" :user="userToDelete" @user-deleted="onUserDeleted" />
    </v-card>
  </v-container>
</template>

<style scoped>
.v-card-title h3 {
  margin-bottom: 4px;
}

.user-card {
  transition: transform 0.2s ease-in-out;
  border-radius: 12px;
}

.user-card:hover {
  transform: translateY(-2px);
}

.text-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.v-table thead tr th) {
  background: rgba(0, 0, 0, 0.03) !important;
  padding: 12px 16px !important;
  letter-spacing: 0.04em;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08) !important;
}
:deep(.v-table tbody tr td) {
  padding: 10px 7px !important;
  vertical-align: middle;
}
:deep(.v-table tbody tr:not(:last-child) td) {
  border-bottom: 1px solid rgba(0, 0, 0, 0.05) !important;
}
</style>
