<script setup lang="ts">
import { computed } from 'vue'
import {
  getRoleColor,
  getRoleText,
  formatDate
} from '@/utils/helpers'
import { useUserRolesStore } from '@/stores/roles'

interface User {
  id: string
  email?: string
  full_name?: string
  student_number?: string
  role_id?: number
  status?: string
  created_at?: string
  user_metadata?: Record<string, any>
}

interface Props {
  modelValue: boolean
  user: User | null
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// Composables
const rolesStore = useUserRolesStore()

// Computed properties
const userRoleTitle = computed(() => {
  if (!props.user?.role_id) return 'Unknown'

  const role = rolesStore.roles.find(role => role.id === props.user?.role_id)
  return role?.title || 'Unknown'
})

const closeDialog = () => {
  emit('update:modelValue', false)
}
</script>

<template>
  <!-- User Details Dialog -->
  <v-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    max-width="500px"
  >
    <v-card v-if="user" class="pa-4">
      <v-card-title class="d-flex flex-column align-center text-center">
        <v-avatar color="primary" size="80" class="mb-4">
          <v-icon size="50">mdi-account-circle</v-icon>
        </v-avatar>
        <h2 class="text-h5 mb-1">{{ user.full_name || 'User' }}</h2>
        <p class="text-body-2 text-grey">{{ user.email }}</p>
      </v-card-title>

      <v-card-text class="mt-4">
        <v-list density="compact">


          <v-divider class="my-2"></v-divider>

          <v-list-item prepend-icon="mdi-account-tie">
            <v-list-item-title>Role</v-list-item-title>
            <v-list-item-subtitle>
              <v-chip :color="getRoleColor(user.role_id)" variant="tonal" size="small">
                {{ userRoleTitle }}
              </v-chip>
              <div class="text-caption text-grey mt-1">
                Debug: role_id={{ user.role_id }}, metadata_role={{ user.user_metadata?.role }}
              </div>
            </v-list-item-subtitle>
          </v-list-item>

          <v-divider class="my-2"></v-divider>

          <v-list-item prepend-icon="mdi-list-status">
            <v-list-item-title>Status</v-list-item-title>
            <v-list-item-subtitle>

            </v-list-item-subtitle>
          </v-list-item>

          <v-divider class="my-2"></v-divider>

          <v-list-item prepend-icon="mdi-calendar-clock">
            <v-list-item-title>Member Since</v-list-item-title>
            <v-list-item-subtitle>{{ formatDate(user.created_at) }}</v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </v-card-text>

      <v-card-actions class="mt-4">
        <v-spacer></v-spacer>
        <v-btn color="primary" variant="flat" @click="closeDialog" block>
          Close
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
