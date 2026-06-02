<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'
import { useAuthUserStore } from '@/stores/authUser'
import { createDisplaySlugName, getEmailInitials, getRoleText, getRoleColor } from '@/utils/helpers'

const authStore = useAuthUserStore()
const router = useRouter()
const { mobile } = useDisplay()

interface Props {
  /** When true, shows a compact logout icon button next to the avatar */
  showInlineLogout?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showInlineLogout: false
})

// Dropdown menu state
const menu = ref(false)

// Computed properties for user data
const userEmail = computed(() => authStore.userEmail)
const displayName = computed(() => createDisplaySlugName(userEmail.value))
const userInitials = computed(() => getEmailInitials(userEmail.value))
const userRole = computed(() => authStore.userRole)
const userRoleText = computed(() => getRoleText(userRole.value))
const userRoleColor = computed(() => getRoleColor(userRole.value))

// Handle logout
async function handleLogout() {
  try {
    menu.value = false // Close dropdown first
    await authStore.signOut()
  } catch (error) {
    console.error('Logout failed:', error)
  }
}

async function goToSettings() {
  try {
    menu.value = false
    await router.push('/account/settings')
  } catch (error) {
    console.error('Navigation to settings failed:', error)
  }
}
</script>

<template>
  <div class="d-flex align-center ga-1">
    <!-- User Avatar/Button -->
    <v-menu
      v-model="menu"
      :close-on-content-click="false"
      location="bottom end"
      :offset="8"
      transition="slide-y-transition"
      attach="body"
  :z-index="20000"
    >
      <template #activator="{ props: menuActivatorProps }">
        <v-btn
          v-bind="menuActivatorProps"
          icon
          variant="text"
          :aria-label="`Open user menu for ${userEmail}`"
        >
          <v-avatar
            size="36"
            color="primary"
            class="avatar-with-border"
          >
            <span class="text-white font-weight-medium">
              {{ userInitials }}
            </span>
          </v-avatar>
        </v-btn>
      </template>

      <!-- Dropdown Menu -->
      <v-card
        min-width="280"
        class="user-dropdown-card"
        elevation="8"
        rounded="lg"
      >
        <!-- User Info Header -->
        <v-card-item class="pb-2">
          <div class="d-flex align-center">
            <v-avatar
              size="48"
              color="primary"
              class="me-3"
            >
              <span class="text-white font-weight-bold">
                {{ userInitials }}
              </span>
            </v-avatar>

            <div class="flex-grow-1">
              <div class="text-h6 font-weight-bold text-high-emphasis">
                {{ displayName }}
              </div>
              <div class="text-body-2 text-medium-emphasis">
                {{ userEmail }}
              </div>
              <div class="d-flex align-center mt-1" v-if="userRole">
                <v-chip
                  :color="userRoleColor"
                  size="x-small"
                  variant="flat"
                  class="text-caption font-weight-medium"
                >
                  {{ userRoleText }}
                </v-chip>
              </div>
            </div>
          </div>
        </v-card-item>

        <v-divider class="mx-4" />

        <!-- Menu Actions -->
        <v-card-actions class="pa-4">
          <v-btn
            v-if="mobile"
            block
            variant="outlined"
            prepend-icon="mdi-cog"
            color="primary"
            @click="goToSettings"
            rounded="lg"
          >
            Settings
          </v-btn>

          <v-btn
            v-else
            block
            variant="outlined"
            prepend-icon="mdi-logout"
            color="error"
            :loading="authStore.loading"
            @click="handleLogout"
            rounded="lg"
          >
            Logout
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-menu>

    <!-- Inline logout control (requested) -->
    <v-tooltip v-if="props.showInlineLogout" location="bottom">
      <template #activator="{ props: tooltipProps }">
        <v-btn
          v-bind="tooltipProps"
          class="flex-grow-1"
          variant="outlined"
          color="error"
          prepend-icon="mdi-logout"
          :loading="authStore.loading"
          :aria-label="'Logout'"
          @click="handleLogout"
					 rounded="lg"
        >
          Logout
        </v-btn>
      </template>
      <span>Logout</span>
    </v-tooltip>
  </div>
</template>

<style scoped>
.avatar-with-border {
  border: 2px solid rgba(var(--v-theme-secondary), 1) !important;
}

.user-dropdown-card {
  border: 1px solid rgba(var(--v-theme-outline), 0.12);
  backdrop-filter: blur(8px);
  background: rgba(var(--v-theme-surface), 0.95) !important;
}


/* Responsive adjustments */
@media (max-width: 599px) {
  .user-dropdown-card {
    min-width: 260px;
  }
}

/* Dark mode adjustments */
.v-theme--dark .user-dropdown-card {
  background: rgba(var(--v-theme-surface-bright), 0.95) !important;
  border-color: rgba(var(--v-theme-outline), 0.2);
}

/* Animation for smooth dropdown */
.v-menu > .v-overlay__content {
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
