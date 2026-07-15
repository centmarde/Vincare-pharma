<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useLogsDataStore } from '@/stores/logsData'
import { useAuthUserStore } from '@/stores/authUser'
import UserLogListDialog from '@/pages/logs/dialogs/UserLogListDialog.vue'
import { useDisplay } from 'vuetify'

const logsStore = useLogsDataStore()
const authStore = useAuthUserStore()
const { logs, loading: logsLoading } = storeToRefs(logsStore)
const { users } = storeToRefs(authStore)
const { mobile } = useDisplay()

const loading = ref(true)
const search = ref('')
const selectedUser = ref<{ id: string; email: string } | null>(null)
const showDialog = ref(false)

const usersWithLogCounts = computed(() => {
  const counts: Record<string, number> = {}

  logs.value.forEach((log) => {
    if (log.created_by) {
      counts[log.created_by] = (counts[log.created_by] || 0) + 1
    }
  })

  return users.value
    .filter((user: any) => counts[user.id] > 0)
    .map((user: any) => ({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || user.email,
      logCount: counts[user.id] || 0,
    }))
    .sort((a, b) => b.logCount - a.logCount)
})

const openUserLogs = (userId: string, email: string) => {
  selectedUser.value = { id: userId, email }
  showDialog.value = true
}

const closeDialog = () => {
  showDialog.value = false
  selectedUser.value = null
}

onMounted(async () => {
  await Promise.all([fetchLogs(), fetchUsers()])
})

const fetchLogs = async () => {
  if (!logsStore.logs.length) {
    await logsStore.fetchLogs()
  }
}

const fetchUsers = async () => {
  if (!authStore.users.length) {
    await authStore.getAllUsers()
  }
  loading.value = false
}

watch(
  () => logsStore.logs,
  () => {
    // recompute happens automatically via computed
  },
)
</script>

<template>
  <v-card>
    <!-- Toolbar -->
    <v-toolbar density="compact" color="transparent">
      <v-icon icon="mdi-account-group-outline" color="primary" size="20" class="ml-2 mr-1"></v-icon>
      <v-toolbar-title class="text-subtitle-1 font-weight-bold pa-0">Users Activity Logs</v-toolbar-title>
      <v-spacer></v-spacer>
      <v-btn
        icon="mdi-refresh"
        variant="text"
        size="small"
        :loading="logsLoading"
        @click="fetchLogs(); fetchUsers()"
        class="mr-1"
      ></v-btn>
    </v-toolbar>

    <v-divider></v-divider>

    <!-- Mobile search -->
    <div v-if="mobile" class="px-3 pb-2 pt-2">
      <v-text-field
        v-model="search"
        label="Search users..."
        prepend-inner-icon="mdi-magnify"
        variant="outlined"
        density="compact"
        hide-details
        clearable
      ></v-text-field>
    </div>

    <v-card-text class="pa-0">
      <!-- Desktop table -->
      <v-data-table
        v-if="!mobile"
        :headers="[
          { title: 'User', key: 'full_name', sortable: true },
          { title: 'Email', key: 'email', sortable: true },
          { title: 'Log Count', key: 'logCount', sortable: true },
          { title: 'Actions', key: 'actions', sortable: false, width: 120 },
        ]"
        :items="usersWithLogCounts"
        :loading="loading"
        hover
        density="comfortable"
      >
        <template #[`item.full_name`]="{ item }">
          <div class="d-flex align-center ga-2">
            <v-avatar color="primary" variant="tonal" size="32">
              <span class="text-caption font-weight-bold text-primary">
                {{ item.full_name.charAt(0).toUpperCase() }}
              </span>
            </v-avatar>
            <span class="text-body-2">{{ item.full_name }}</span>
          </div>
        </template>

        <template #[`item.email`]="{ item }">
          <span class="text-body-2">{{ item.email }}</span>
        </template>

        <template #[`item.logCount`]="{ item }">
          <v-chip
            :color="item.logCount > 0 ? 'primary' : 'grey'"
            size="small"
            variant="tonal"
            class="font-weight-medium"
          >
            {{ item.logCount }}
          </v-chip>
        </template>

        <template #[`item.actions`]="{ item }">
          <v-btn
					  icon=""
            size="small"
            variant="outlined"
            color="primary"
            :disabled="item.logCount === 0"
            @click="openUserLogs(item.id, item.email)"
          >
					  <v-icon size="16">mdi-text-box-search-outline</v-icon>
            <v-tooltip activator="parent" location="top">View user logs</v-tooltip>
          </v-btn>
        </template>
      </v-data-table>

      <!-- Mobile cards -->
      <template v-else>
        <div v-if="usersWithLogCounts.length > 0" class="pa-3">
          <v-card
            v-for="user in usersWithLogCounts"
            :key="user.id"
            class="mb-3"
            rounded="lg"
            elevation="2"
          >
            <v-card-title class="d-flex align-center ga-2 pa-3 pb-1">
              <v-avatar color="primary" variant="tonal" size="36">
                <span class="text-subtitle-2 font-weight-bold text-primary">
                  {{ user.full_name.charAt(0).toUpperCase() }}
                </span>
              </v-avatar>
              <div>
                <div class="text-body-1 font-weight-medium">{{ user.full_name }}</div>
                <div class="text-caption text-medium-emphasis">{{ user.email }}</div>
              </div>
            </v-card-title>

            <v-card-text class="pa-3 pt-1">
              <div class="d-flex align-center justify-space-between">
                <span class="text-caption text-medium-emphasis">Activity Logs</span>
                <v-chip
                  :color="user.logCount > 0 ? 'primary' : 'grey'"
                  size="small"
                  variant="tonal"
                  class="font-weight-medium"
                >
                  {{ user.logCount }}
                </v-chip>
              </div>
            </v-card-text>

            <v-card-actions class="pa-3 pt-0">
              <v-btn
                size="small"
                variant="outlined"
                color="primary"
                block
                :disabled="user.logCount === 0"
                @click="openUserLogs(user.id, user.email)"
              >
                <v-icon size="16" class="mr-1" icon="mdi-text-box-search-outline"></v-icon>
                View Logs
              </v-btn>
            </v-card-actions>
          </v-card>
        </div>

        <!-- Mobile empty state -->
        <div v-else-if="!loading" class="text-center pa-6">
          <v-icon
            icon="mdi-account-group-outline"
            size="48"
            color="grey-lighten-1"
            class="mb-3"
          ></v-icon>
          <div class="text-h6 text-medium-emphasis mb-1">No users found</div>
          <div class="text-body-2 text-medium-emphasis">Users with activity logs will appear here.</div>
        </div>

        <!-- Mobile loading -->
        <div v-if="loading" class="text-center pa-6">
          <v-progress-circular indeterminate color="primary" size="32"></v-progress-circular>
          <div class="text-body-2 mt-2 text-medium-emphasis">Loading users...</div>
        </div>
      </template>
    </v-card-text>

    <UserLogListDialog
      v-model="showDialog"
      :userId="selectedUser?.id || ''"
      :userEmail="selectedUser?.email || ''"
      @close="closeDialog"
    />
  </v-card>
</template>

<style scoped>
.v-data-table {
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}
</style>
