<script lang="ts" setup>
  import type { UIConfig, LogoConfig } from '@/controller/landingController'
  import { computed, ref, onMounted, onUnmounted } from 'vue'
  import { useRouter } from 'vue-router'
  import { useTheme } from '@/composables/useTheme'
  import { useDisplay } from 'vuetify'
  import { useAuthUserStore } from '@/stores/authUser'
  import SlugName from './SlugName.vue'
  import { navigationConfig, type NavigationGroup, type NavigationItem } from '@/utils/navigation'

  interface Props {
    config?: UIConfig | null
  }

  const props = defineProps<Props>()
  const router = useRouter()
  const authStore = useAuthUserStore()

  // Responsive breakpoints
  const { mobile } = useDisplay()

  // Mobile drawer state
  const mobileDrawer = ref(false)

  // Theme management
  const { toggleTheme: handleToggleTheme, getCurrentTheme, isLoadingTheme } = useTheme()

  // Scroll detection for mobile drawer auto-close
  let lastScrollY = ref(0)
  let ticking = ref(false)

  const handleScroll = () => {
    if (!ticking.value) {
      requestAnimationFrame(() => {
        const currentScrollY = window.scrollY

        // Close mobile drawer when scrolling down
        if (mobile.value && mobileDrawer.value && currentScrollY > lastScrollY.value) {
          mobileDrawer.value = false
        }

        lastScrollY.value = currentScrollY
        ticking.value = false
      })
      ticking.value = true
    }
  }

  // Add scroll listener on mount, remove on unmount
  onMounted(() => {
    window.addEventListener('scroll', handleScroll, { passive: true })
    lastScrollY.value = window.scrollY
  })

  onUnmounted(() => {
    window.removeEventListener('scroll', handleScroll)
  })

  const navbarConfig = computed(() => props.config?.navbar)

  // Theme toggle computed properties
  const currentTheme = computed(() => getCurrentTheme())
  const themeIcon = computed(() => {
    return currentTheme.value === 'dark' ? 'mdi-white-balance-sunny' : 'mdi-weather-night'
  })
  const themeTooltip = computed(() => {
    return `Switch to ${currentTheme.value === 'dark' ? 'light' : 'dark'} theme`
  })

  function toggleTheme () {
    handleToggleTheme()
  }

  async function handleLogout () {
    try {
      await authStore.signOut()
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }
</script>

<template>
  <div v-if="config?.showNavbar && navbarConfig">
    <!-- Top Navigation Bar -->
    <v-app-bar
      app
      :elevation="3"
      density="comfortable"
      height="72"
      color="surface"
      border="b-sm"
      flat
      scroll-behavior="elevate"
      scroll-threshold="50"
      class="top-navbar"
    >
      <!-- Brand/Logo Section -->
      <template #prepend>
        <div class="d-flex align-center">
          <!-- Logo Image with Icon Fallback -->
          <template v-if="navbarConfig.logo?.src">
            <v-img
              :src="navbarConfig.logo.src"
              :alt="navbarConfig.logo.alt"
              :width="mobile ? (navbarConfig.logo.width || 36) : (navbarConfig.logo.width || 44)"
              :height="mobile ? (navbarConfig.logo.height || 36) : (navbarConfig.logo.height || 44)"
              class="me-3 brand-avatar"
              contain
            >
              <template #error>
                <!-- Fallback to avatar with icon if image fails to load -->
                <v-avatar
                  :color="navbarConfig.color"
                  :size="mobile ? 36 : 44"
                  class="me-3 brand-avatar"
                >
                  <v-icon
                    :icon="navbarConfig.icon"
                    :size="mobile ? 20 : 26"
                    color="white"
                  />
                </v-avatar>
              </template>
            </v-img>
          </template>
          <template v-else>
            <!-- Default avatar with icon when no logo is configured -->
            <v-avatar
              :color="navbarConfig.color"
              :size="mobile ? 36 : 44"
              class="me-3 brand-avatar"
            >
              <v-icon
                :icon="navbarConfig.icon"
                :size="mobile ? 20 : 26"
                color="white"
              />
            </v-avatar>
          </template>

          <div class="d-none d-sm-block">
            <h2 class="text-h6 font-weight-bold text-primary mb-0">
              {{ navbarConfig.title }}
            </h2>
            <p class="text-caption text-medium-emphasis mb-0">
              Academic Platform
            </p>
          </div>
        </div>
      </template>

      <v-spacer />

      <!-- Desktop Action Buttons -->
      <template #append>
        <div class="d-none d-md-flex align-center">
          <!-- Theme Toggle -->
          <v-btn
            :icon="themeIcon"
            variant="text"
            size="large"
            class="me-2"
            :loading="isLoadingTheme"
            @click="toggleTheme"
          >
          <v-icon></v-icon>
            <v-tooltip activator="parent" location="bottom">
              {{ themeTooltip }}
            </v-tooltip>
          </v-btn>

          <!-- User Slug Name Component -->
          <SlugName />
        </div>

        <!-- Mobile Menu Toggle -->
        <v-btn
          icon="mdi-menu"
          variant="text"
          size="large"
          class="d-md-none"
          @click="mobileDrawer = !mobileDrawer"
        />
      </template>
    </v-app-bar>

    <!-- Mobile Navigation Drawer -->
    <v-navigation-drawer
      v-model="mobileDrawer"
      location="end"
      temporary
      :width="mobile ? 300 : 320"
      class="d-md-none mobile-drawer"
      :elevation="8"
    >
      <!-- Mobile Header -->
      <v-card
        class="ma-4 pa-4"
        variant="tonal"
        rounded="xl"
        :color="navbarConfig.color"
      >
        <div class="d-flex align-center">
          <!-- Logo Image with Icon Fallback -->
          <template v-if="navbarConfig.logo?.src">
            <v-img
              :src="navbarConfig.logo.src"
              :alt="navbarConfig.logo.alt"
              :width="mobile ? (navbarConfig.logo.width || 48) : (navbarConfig.logo.width || 56)"
              :height="mobile ? (navbarConfig.logo.height || 48) : (navbarConfig.logo.height || 56)"
              class="me-4"
              contain
            >
              <template #error>
                <!-- Fallback to avatar with icon if image fails to load -->
                <v-avatar
                  :color="navbarConfig.color"
                  :size="mobile ? 48 : 56"
                  class="me-4"
                  variant="elevated"
                >
                  <v-icon
                    :icon="navbarConfig.icon"
                    :size="mobile ? 28 : 32"
                    color="white"
                  />
                </v-avatar>
              </template>
            </v-img>
          </template>
          <template v-else>
            <!-- Default avatar with icon when no logo is configured -->
            <v-avatar
              :color="navbarConfig.color"
              :size="mobile ? 48 : 56"
              class="me-4"
              variant="elevated"
            >
              <v-icon
                :icon="navbarConfig.icon"
                :size="mobile ? 28 : 32"
                color="white"
              />
            </v-avatar>
          </template>

          <div>
            <h3 class="text-h6 font-weight-bold">
              {{ navbarConfig.title }}
            </h3>
            <p class="text-caption opacity-80 mb-0">
              Academic Platform
            </p>
          </div>
        </div>
      </v-card>

      <v-divider class="my-4 mx-4" />

      <!-- Navigation Menu -->
      <v-list nav class="px-2">
        <template v-for="group in navigationConfig" :key="group.title">
          <!-- Navigation Group -->
          <v-list-group :value="group.title">
            <template #activator="{ props: activatorProps }">
              <v-list-item
                v-bind="activatorProps"
                :prepend-icon="group.icon"
                :title="group.title"
                rounded="xl"
                class="ma-1"
              />
            </template>

            <!-- Navigation Items -->
            <v-list-item
              v-for="item in group.children"
              :key="item.route"
              :prepend-icon="item.icon"
              :title="item.title"
              :to="item.route"
              rounded="xl"
              class="ma-1 ms-4"
              @click="mobileDrawer = false"
            />
          </v-list-group>
        </template>
      </v-list>

      <!-- Mobile Actions -->
      <template #append>
        <v-card
          class="ma-4 pa-4"
          variant="outlined"
          rounded="xl"
        >
          <!-- Theme Toggle -->
          <v-btn
            block
            variant="outlined"
            :prepend-icon="themeIcon"
            size="small"
            rounded="lg"
            :loading="isLoadingTheme"
            @click="toggleTheme"
            class="text-caption mb-3"
          >
            {{ currentTheme === 'dark' ? 'Light' : 'Dark' }}
          </v-btn>

          <!-- User Menu with SlugName -->
          <SlugName />
        </v-card>
      </template>
    </v-navigation-drawer>
  </div>
</template>

<style scoped>
/* Top Navigation Styles */
.top-navbar {
  backdrop-filter: blur(8px);
  background: rgba(var(--v-theme-surface), 0.95) !important;
  border-bottom: 1px solid rgba(var(--v-theme-outline), 0.1);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.top-navbar:hover {
  background: rgba(var(--v-theme-surface), 1) !important;
  box-shadow: 0 4px 12px rgba(var(--v-theme-primary), 0.1);
}

/* Enhanced scroll elevation behavior */
.v-app-bar--scroll-elevated {
  box-shadow: 0 4px 12px rgba(var(--v-theme-primary), 0.15) !important;
  background: rgba(var(--v-theme-surface), 1) !important;
}

/* Mobile Navigation Drawer */
.mobile-drawer {
  backdrop-filter: blur(12px);
}

/* Enhanced mobile drawer with auto-close behavior */
.mobile-drawer .v-navigation-drawer__content {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Responsive drawer styling */
@media (max-width: 599px) {
  .mobile-drawer {
    width: 280px !important;
  }
}

/* Animations */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Responsive Adjustments */
@media (max-width: 959px) {
  .top-navbar {
    height: 64px !important;
  }
}

@media (max-width: 599px) {
  .brand-avatar {
    width: 40px !important;
    height: 40px !important;
  }
}

/* Dark Mode Adjustments */
.v-theme--dark .top-navbar {
  background: rgba(var(--v-theme-surface), 0.9) !important;
  border-color: rgba(var(--v-theme-outline), 0.15);
}

.v-theme--dark .top-navbar:hover {
  background: rgba(var(--v-theme-surface-bright), 0.95) !important;
  box-shadow: 0 4px 12px rgba(var(--v-theme-primary), 0.15);
}

/* Focus and Accessibility */
.v-btn:focus {
  outline: 2px solid rgba(var(--v-theme-primary), 0.5);
  outline-offset: 2px;
}

/* Smooth transitions for theme changes */
* {
  transition: color 0.2s ease, background-color 0.2s ease, border-color 0.2s ease;
}

/* Enhanced Mobile Drawer Styling */
.mobile-drawer .v-navigation-drawer__content {
  background: linear-gradient(
    180deg,
    rgba(var(--v-theme-surface), 1) 0%,
    rgba(var(--v-theme-surface-bright), 0.98) 100%
  );
}

/* Elevated styling for mobile header */
.mobile-drawer .v-card {
  position: relative;
  overflow: hidden;
}

.mobile-drawer .v-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.1) 0%,
    rgba(255, 255, 255, 0.05) 100%
  );
  pointer-events: none;
}

/* Loading state styling */
.v-btn--loading {
  pointer-events: none;
}

/* Improved scrollbar for mobile drawer */
.mobile-drawer ::-webkit-scrollbar {
  width: 6px;
}

.mobile-drawer ::-webkit-scrollbar-track {
  background: rgba(var(--v-theme-outline), 0.05);
  border-radius: 3px;
}

.mobile-drawer ::-webkit-scrollbar-thumb {
  background: rgba(var(--v-theme-primary), 0.3);
  border-radius: 3px;
}

.mobile-drawer ::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--v-theme-primary), 0.5);
}
</style>
