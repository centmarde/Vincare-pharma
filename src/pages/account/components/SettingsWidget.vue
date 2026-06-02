<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { createDisplaySlugName, getEmailInitials, getErrorMessage } from '@/utils/helpers'
import { passwordValidator } from '@/lib/validator'

const toast = useToast()
const authStore = useAuthUserStore()

// Tab state
const activeTab = ref(0)

// Form state
const userProfile = ref({
  displayName: '',
  email: ''
})

const passwordForm = ref({
  newPassword: '',
  confirmPassword: ''
})

// Loading states
const loading = ref(false)
const savingProfile = ref(false)
const changingPassword = ref(false)

// Form refs
const passwordFormRef = ref<any>(null)

// Computed properties - Use authStore email for more reliable data
const userEmail = computed(() => authStore.userEmail || userProfile.value.email)
const slugName = computed(() => createDisplaySlugName(userEmail.value))
const userInitials = computed(() => getEmailInitials(userEmail.value))

// Password validation computed properties
const passwordRequirements = computed(() => {
  const password = passwordForm.value.newPassword

  return {
    length: password.length >= 8,
    upperAndLower: /(?=.*[a-z])(?=.*[A-Z])/.test(password),
    number: /(?=.*\d)/.test(password),
    special: /(?=.*[!@#$%&*()_+\-=\[\]{};':"\\|,.<>\/?])/.test(password),
    different: password !== '' // We'll assume different from current for now
  }
})

const isPasswordValid = computed(() => {
  const reqs = passwordRequirements.value
  return reqs.length && reqs.upperAndLower && reqs.number && reqs.special && reqs.different
})

// Form validation rules
const rules = {
  required: (value: string) => !!value || 'Field is required',
  email: (value: string) => {
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return pattern.test(value) || 'Invalid email address'
  },
  password: (value: string) => passwordValidator(value),
  passwordMatch: (value: string) =>
    value === passwordForm.value.newPassword || 'Passwords do not match'
}

// Methods
const loadUserProfile = async () => {
  try {
    loading.value = true
    const result = await authStore.getCurrentUser()

    if (result.error || !result.user) {
      toast.error('Failed to load user profile')
      return
    }

    userProfile.value = {
      displayName: result.user.user_metadata?.full_name || result.user.full_name || '',
      email: result.user.email || ''
    }
  } catch (error) {
    console.error('Error loading user profile:', error)
    toast.error('Failed to load user profile')
  } finally {
    loading.value = false
  }
}

const saveProfile = async () => {
  try {
    savingProfile.value = true

    if (!authStore.userData?.id) {
      toast.error('User not authenticated')
      return
    }

    const updateData = {
      email: userProfile.value.email,
      user_metadata: {
        ...authStore.userData.user_metadata,
        full_name: userProfile.value.displayName
      }
    }

    const result = await authStore.updateUser(authStore.userData.id, updateData)

    if (result.error) {
      toast.error('Failed to update profile: ' + getErrorMessage(result.error))
      return
    }

    // Update the current user data in the store
    await authStore.initializeAuth()

    toast.success('Profile updated successfully!')
  } catch (error) {
    console.error('Error updating profile:', error)
    toast.error('Failed to update profile')
  } finally {
    savingProfile.value = false
  }
}

const changePassword = async () => {
  try {
    changingPassword.value = true

    if (!authStore.userData?.id) {
      toast.error('User not authenticated')
      return
    }

    if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    if (passwordForm.value.newPassword.length < 6) {
      toast.error('Password must be at least 6 characters long')
      return
    }

    // Use Supabase admin to update password
    const result = await authStore.updateUser(authStore.userData.id, {
      password: passwordForm.value.newPassword
    })

    if (result.error) {
      toast.error('Failed to change password: ' + getErrorMessage(result.error))
      return
    }

    // Clear password form
    passwordForm.value = {
      newPassword: '',
      confirmPassword: ''
    }

    // Reset form validation
    if (passwordFormRef.value) {
      passwordFormRef.value.resetValidation()
    }

    toast.success('Password changed successfully!')
  } catch (error) {
    console.error('Error changing password:', error)
    toast.error('Failed to change password')
  } finally {
    changingPassword.value = false
  }
}

// Initialize component
onMounted(() => {
  loadUserProfile()
})
</script>

<template>
  <v-row no-gutters class="fill-height">
    <!-- Left Sidebar - Current Profile -->
    <v-col cols="12" md="3" class="bg-grey-darken-4">
      <v-card flat class="bg-grey-darken-4 text-white pa-6 fill-height">
        <div class="d-flex align-center mb-4">
          <v-icon icon="mdi-account-circle" class="mr-2" color="blue-accent-2"></v-icon>
          <h3 class="text-h6 font-weight-medium">Current Profile</h3>
          <v-spacer></v-spacer>
          <v-icon icon="mdi-refresh" size="small" class="opacity-75"></v-icon>
        </div>

        <div class="text-center mb-6">
          <v-avatar size="120" class="mb-4" color="primary">
            <span class="text-h3 font-weight-bold text-white">
              {{ userInitials }}
            </span>
          </v-avatar>

          <h4 class="text-h5 font-weight-bold mb-1">{{ slugName }}</h4>
          <p class="text-body-2 text-grey-lighten-1">{{ userEmail }}</p>
        </div>
      </v-card>
    </v-col>

    <!-- Main Content Area -->
    <v-col cols="12" md="9">
      <div class="pa-6">
        <!-- Header -->
        <div class="d-flex align-center mb-6">
          <v-icon icon="mdi-cog" class="mr-3" color="blue-accent-2" size="large"></v-icon>
          <h2 class="text-h4 font-weight-bold">Profile Settings</h2>
        </div>

        <!-- Tabs -->
        <v-tabs
          v-model="activeTab"
          bg-color="transparent"
          color="blue-accent-2"
          class="mb-6"
        >
          <v-tab
            :value="0"
            prepend-icon="mdi-account"
            class="text-uppercase font-weight-bold px-8"
          >
            Profile Information
          </v-tab>

          <v-tab
            :value="1"
            prepend-icon="mdi-lock"
            class="text-uppercase font-weight-bold px-8"
          >
            Change Password
          </v-tab>
        </v-tabs>

        <v-divider class="mb-6"></v-divider>

        <!-- Tab Content -->
        <v-tabs-window v-model="activeTab">
          <!-- Profile Information Tab -->
          <v-tabs-window-item :value="0">
            <v-form @submit.prevent="saveProfile">
              <v-row class="mt-4">
                <v-col cols="12" sm="6">
                  <v-text-field
                    v-model="userProfile.displayName"
                    label="Full Name"
                    prepend-inner-icon="mdi-account"
                    variant="outlined"
                    density="comfortable"
                    :rules="[rules.required]"
                    :loading="loading"
                    class="mb-4"
                  ></v-text-field>
                </v-col>
                <v-col cols="12" sm="6">
                  <v-text-field
                    v-model="userProfile.email"
                    label="Email Address"
                    prepend-inner-icon="mdi-email"
                    variant="outlined"
                    density="comfortable"
                    type="email"
                    :rules="[rules.required, rules.email]"
                    :loading="loading"
                    class="mb-4"
                    hint="Email cannot be changed here"
                    persistent-hint
                  ></v-text-field>
                </v-col>
              </v-row>

              <v-row>
                <v-col cols="12" sm="6">
                  <v-text-field
                    label="Phone Number"
                    prepend-inner-icon="mdi-phone"
                    variant="outlined"
                    density="comfortable"
                    class="mb-4"
                    placeholder="Enter your phone number"
                  ></v-text-field>
                </v-col>
              </v-row>

              <v-row class="mt-4">
                <v-col cols="12">
                  <v-btn
                    type="submit"
                    color="blue-accent-2"
                    variant="elevated"
                    :loading="savingProfile"
                    :disabled="loading"
                    class="mr-4"
                  >
                    <v-icon icon="mdi-content-save" class="mr-2"></v-icon>
                    Save Changes
                  </v-btn>

                  <v-btn
                    variant="outlined"
                    color="grey"
                    :disabled="savingProfile || loading"
                    @click="loadUserProfile"
                  >
                    <v-icon icon="mdi-refresh" class="mr-2"></v-icon>
                    Reset
                  </v-btn>
                </v-col>
              </v-row>
            </v-form>
          </v-tabs-window-item>

          <!-- Change Password Tab -->
          <v-tabs-window-item :value="1">
            <v-form ref="passwordFormRef" @submit.prevent="changePassword">
              <v-row>
                <v-col cols="12" sm="6">
                  <v-text-field
                    v-model="passwordForm.newPassword"
                    label="New Password"
                    prepend-inner-icon="mdi-lock-plus"
                    variant="outlined"
                    density="comfortable"
                    type="password"
                    :rules="[rules.required, rules.password]"
                    autocomplete="new-password"
                    class="mb-4"
                  ></v-text-field>
                </v-col>
                <v-col cols="12" sm="6">
                  <v-text-field
                    v-model="passwordForm.confirmPassword"
                    label="Confirm New Password"
                    prepend-inner-icon="mdi-lock-check"
                    variant="outlined"
                    density="comfortable"
                    type="password"
                    :rules="[rules.required, rules.passwordMatch]"
                    autocomplete="new-password"
                    class="mb-4"
                  ></v-text-field>
                </v-col>
              </v-row>

              <!-- Minimalist Password Requirements -->
              <div class="mb-6">
                <p class="text-caption text-medium-emphasis mb-2">Password Requirements</p>
                <div class="d-flex flex-wrap ga-4">
                  <v-chip
                    size="small"
                    :color="passwordRequirements.length ? 'success' : 'default'"
                    :variant="passwordRequirements.length ? 'flat' : 'outlined'"
                  >
                    <v-icon
                      :icon="passwordRequirements.length ? 'mdi-check' : 'mdi-circle-outline'"
                      start
                      size="x-small"
                    ></v-icon>
                    8+ chars
                  </v-chip>

                  <v-chip
                    size="small"
                    :color="passwordRequirements.upperAndLower ? 'success' : 'default'"
                    :variant="passwordRequirements.upperAndLower ? 'flat' : 'outlined'"
                  >
                    <v-icon
                      :icon="passwordRequirements.upperAndLower ? 'mdi-check' : 'mdi-circle-outline'"
                      start
                      size="x-small"
                    ></v-icon>
                    A-z
                  </v-chip>

                  <v-chip
                    size="small"
                    :color="passwordRequirements.number ? 'success' : 'default'"
                    :variant="passwordRequirements.number ? 'flat' : 'outlined'"
                  >
                    <v-icon
                      :icon="passwordRequirements.number ? 'mdi-check' : 'mdi-circle-outline'"
                      start
                      size="x-small"
                    ></v-icon>
                    0-9
                  </v-chip>

                  <v-chip
                    size="small"
                    :color="passwordRequirements.special ? 'success' : 'default'"
                    :variant="passwordRequirements.special ? 'flat' : 'outlined'"
                  >
                    <v-icon
                      :icon="passwordRequirements.special ? 'mdi-check' : 'mdi-circle-outline'"
                      start
                      size="x-small"
                    ></v-icon>
                    !@#$
                  </v-chip>

                  <v-chip
                    size="small"
                    :color="passwordRequirements.different ? 'success' : 'default'"
                    :variant="passwordRequirements.different ? 'flat' : 'outlined'"
                  >
                    <v-icon
                      :icon="passwordRequirements.different ? 'mdi-check' : 'mdi-circle-outline'"
                      start
                      size="x-small"
                    ></v-icon>
                    New
                  </v-chip>
                </div>
              </div>

              <v-row class="mt-4">
                <v-col cols="12">
                  <v-btn
                    type="submit"
                    color="blue-accent-2"
                    variant="elevated"
                    :loading="changingPassword"
                    :disabled="loading || !isPasswordValid || passwordForm.newPassword !== passwordForm.confirmPassword"
                    class="mr-4"
                  >
                    <v-icon icon="mdi-key-change" class="mr-2"></v-icon>
                    Update Password
                  </v-btn>

                  <v-btn
                    variant="outlined"
                    color="grey"
                    :disabled="changingPassword || loading"
                    @click="passwordForm = { newPassword: '', confirmPassword: '' }"
                  >
                    <v-icon icon="mdi-cancel" class="mr-2"></v-icon>
                    Clear
                  </v-btn>
                </v-col>
              </v-row>
            </v-form>
          </v-tabs-window-item>
        </v-tabs-window>
      </div>
    </v-col>
  </v-row>
</template>
