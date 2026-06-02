<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'
import { useAuthUserStore } from '@/stores/authUser'
import { useUserRolesStore } from '@/stores/roles'
import { useToast } from 'vue-toastification'
import { getErrorMessage } from '@/utils/helpers'

interface User {
  id: string
  email?: string
  full_name?: string
  role_id?: number
  user_metadata?: Record<string, any>
}

interface Props {
  user: User | null
}

interface Emits {
  (e: 'user-updated', user: User): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const model = defineModel<boolean>()

// Composables
const authStore = useAuthUserStore()
const rolesStore = useUserRolesStore()
const toast = useToast()

// Reactive data
const updating = ref(false)
const form = ref()

// Form data
const formData = reactive({
  email: '',
  full_name: '',
  role_id: null as number | null
})

// Validation rules
const rules = computed(() => ({
  email: [
    (v: string) => !!v || 'Email is required',
    (v: string) => /.+@.+\..+/.test(v) || 'Email must be valid'
  ],
  full_name: [
    (v: string) => !!v || 'Full name is required',
    (v: string) => v.length >= 2 || 'Full name must be at least 2 characters'
  ],
  role_id: isCurrentUserAdmin.value ? [
    (v: number | null) => v !== null || 'Role is required'
  ] : []
}))

// Computed
const roleOptions = computed(() => {
  return rolesStore.roles.map(role => ({
    title: role.title,
    value: role.id
  }))
})

const isCurrentUserAdmin = computed(() => {
  return authStore.userRole === 1
})

// Watch for user changes to populate form
watch(() => props.user, (newUser) => {
  if (newUser) {
    formData.email = newUser.email || ''
    formData.full_name = newUser.full_name || ''
    formData.role_id = newUser.role_id || null
  }
}, { immediate: true })

// Watch for dialog close to reset form
watch(model, (isOpen) => {
  if (!isOpen) {
    resetForm()
  }
})

// Methods
const resetForm = () => {
  if (form.value) {
    form.value.reset()
  }
  formData.email = ''
  formData.full_name = ''
  formData.role_id = null
}

const handleSubmit = async () => {
  if (!props.user) return

  const { valid } = await form.value.validate()
  if (!valid) return

  updating.value = true
  try {
    const userMetadata: Record<string, any> = {
      ...props.user.user_metadata,
      full_name: formData.full_name
    }

    // Only update role if current user is admin
    if (isCurrentUserAdmin.value) {
      userMetadata.role = formData.role_id
    }

    const updateData = {
      email: formData.email,
      user_metadata: userMetadata
    }

    const result = await authStore.updateUser(props.user.id, updateData)

    if (result.error) {
      toast.error('Failed to update user: ' + getErrorMessage(result.error))
      console.error('Error updating user:', result.error)
      return
    }

    if (result.user) {
      toast.success('User updated successfully')
      emit('user-updated', result.user)
      model.value = false
    }
  } catch (error) {
    toast.error('An unexpected error occurred while updating user')
    console.error('Unexpected error:', error)
  } finally {
    updating.value = false
  }
}

const handleClose = () => {
  model.value = false
}
</script>

<template>
  <v-dialog v-model="model" max-width="600px" persistent>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon color="primary" class="mr-2">mdi-account-edit</v-icon>
        <span>Edit User</span>
      </v-card-title>

      <v-card-text>
        <v-form ref="form" @submit.prevent="handleSubmit">
          <v-container>
            <v-row>
              <v-col cols="12">
                <v-text-field
                  v-model="formData.email"
                  label="Email Address"
                  prepend-inner-icon="mdi-email"
                  :rules="rules.email"
                  variant="outlined"
                  required
                />
              </v-col>

              <v-col cols="12">
                <v-text-field
                  v-model="formData.full_name"
                  label="Full Name"
                  prepend-inner-icon="mdi-account"
                  :rules="rules.full_name"
                  variant="outlined"
                  required
                />
              </v-col>

              <v-col v-if="isCurrentUserAdmin" cols="12">
                <v-select
                  v-model="formData.role_id"
                  label="Role"
                  prepend-inner-icon="mdi-shield-account"
                  :items="roleOptions"
                  :rules="rules.role_id"
                  variant="outlined"
                  required
                />
              </v-col>
            </v-row>
          </v-container>
        </v-form>

        <v-alert
          v-if="user"
          type="info"
          variant="tonal"
          class="mt-4"
        >
          <div class="font-weight-medium">Current User ID:</div>
          <div class="text-caption">{{ user.id }}</div>
        </v-alert>
      </v-card-text>

      <v-card-actions class="px-4 pb-4">
        <v-spacer />
        <v-btn
          color="grey"
          variant="text"
          @click="handleClose"
          :disabled="updating"
        >
          Cancel
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          @click="handleSubmit"
          :loading="updating"
        >
          Update User
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
