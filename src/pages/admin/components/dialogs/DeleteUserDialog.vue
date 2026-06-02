<script setup lang="ts">
import { ref } from 'vue'
import { useAuthUserStore } from '@/stores/authUser'
import { useToast } from 'vue-toastification'
import { getErrorMessage } from '@/utils/helpers'

interface User {
  id: string
  email?: string
  full_name?: string
  role_id?: number
}

interface Props {
  user: User | null
}

interface Emits {
  (e: 'user-deleted', userId: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const model = defineModel<boolean>()

// Composables
const authStore = useAuthUserStore()
const toast = useToast()

// Reactive data
const deleting = ref(false)

// Methods
const handleDelete = async () => {
  if (!props.user) return

  deleting.value = true
  try {
    const result = await authStore.deleteUser(props.user.id)

    if (result.error) {
      toast.error('Failed to delete user: ' + getErrorMessage(result.error))
      console.error('Error deleting user:', result.error)
      return
    }

    toast.success('User deleted successfully')
    emit('user-deleted', props.user.id)
    model.value = false
  } catch (error) {
    toast.error('An unexpected error occurred while deleting user')
    console.error('Unexpected error:', error)
  } finally {
    deleting.value = false
  }
}

const handleClose = () => {
  model.value = false
}
</script>

<template>
  <v-dialog v-model="model" max-width="500px" persistent>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon color="error" class="mr-2">mdi-delete-alert</v-icon>
        <span>Delete User</span>
      </v-card-title>

      <v-card-text>
        <div class="text-body-1 mb-4">
          Are you sure you want to delete this user? This action cannot be undone.
        </div>

        <v-alert
          type="warning"
          variant="tonal"
          class="mb-4"
        >
          <div class="font-weight-medium">User Details:</div>
          <div><strong>Name:</strong> {{ user?.full_name || 'N/A' }}</div>
          <div><strong>Email:</strong> {{ user?.email || 'N/A' }}</div>
        </v-alert>

        <v-alert
          type="error"
          variant="tonal"
          text="This will permanently remove the user from the system and cannot be undone."
        />
      </v-card-text>

      <v-card-actions class="px-4 pb-4">
        <v-spacer />
        <v-btn
          color="grey"
          variant="text"
          @click="handleClose"
          :disabled="deleting"
        >
          Cancel
        </v-btn>
        <v-btn
          color="error"
          variant="flat"
          @click="handleDelete"
          :loading="deleting"
        >
          Delete User
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.v-card-title {
  background-color: rgb(var(--v-theme-surface-variant));
}
</style>
