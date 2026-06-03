<script lang="ts" setup>
  import type { UIConfig, LogoConfig } from '@/controller/landingController'
  import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import { useDisplay } from 'vuetify'
  import { useTheme } from '@/composables/useTheme'
  import { useAuthUserStore } from '@/stores/authUser'
  import SlugName from './SlugName.vue'
  import { useUserPermissions } from '@/composables/useUserPermissions'

  interface Props {
    config?: UIConfig | null
  }

  const props = defineProps<Props>()
  const router = useRouter()
  const authStore = useAuthUserStore()

  // User permissions composable (permission-based navigation)
  const { getFilteredNavigationGroups, isLoading } = useUserPermissions()

  // Vuetify display composable for responsiveness
  const { mobile, mdAndUp, lgAndUp, xs, sm, md } = useDisplay()

  // Mobile drawer state
  const drawer = ref(false)
  const isScrolled = ref(false)
  const lastScrollY = ref(0)

  // Theme management
  const { toggleTheme: handleToggleTheme, getCurrentTheme, isLoadingTheme } = useTheme()

  const navbarConfig = computed(() => props.config?.navbar)

  // Get filtered navigation groups based on user permissions
  const navigationGroups = computed(() => getFilteredNavigationGroups())

  // Positioning logic that accounts for sidebar
  const navbarPositioning = computed(() => {
    const sidebarWidth = 280 // Match the sidebar width

    if (lgAndUp.value) {
      // Desktop: Position navbar in the content area (after sidebar)
      const availableWidth = `calc(100vw - ${sidebarWidth}px)`
      const margin = isScrolled.value ? 10 : 20
      const navbarWidth = `calc(${availableWidth} - ${margin * 2}px)`

      return {
        top: isScrolled.value ? '10px' : '20px',
        left: `${sidebarWidth + margin}px`,
        transform: isScrolled.value ? 'scale(0.98)' : 'scale(1)',
        width: navbarWidth,
        maxWidth: `calc(1200px - ${sidebarWidth}px - ${margin * 2}px)`,
        right: `${margin}px`
      }
    } else {
      // Mobile: Full width positioning (sidebar is hidden)
      return {
        top: isScrolled.value ? (xs.value ? '4px' : '10px') : (xs.value ? '8px' : '20px'),
        left: '50%',
        transform: `translateX(-50%) ${isScrolled.value ? 'scale(0.98)' : 'scale(1)'}`,
        width: isScrolled.value ? (xs.value ? '96%' : '90%') : (xs.value ? '98%' : '95%'),
        maxWidth: '1200px'
      }
    }
  })

  // Theme toggle computed properties
  const currentTheme = computed(() => getCurrentTheme())
  const themeIcon = computed(() => {
    return currentTheme.value === 'dark' ? 'mdi-white-balance-sunny' : 'mdi-weather-night'
  })
  const themeTooltip = computed(() => {
    return `Switch to ${currentTheme.value === 'dark' ? 'light' : 'dark'} theme`
  })

  // Scroll handler for floating effect and auto-close drawer
  const handleScroll = () => {
    const currentScrollY = window.scrollY
    isScrolled.value = currentScrollY > 20

    // Auto-close drawer when scrolling down on mobile and tablets
    if (!lgAndUp.value && drawer.value) {
      if (currentScrollY > lastScrollY.value && currentScrollY > 100) {
        drawer.value = false
      }
    }

    lastScrollY.value = currentScrollY
  }

  // Watch for drawer state changes and close on route change
  watch(() => router.currentRoute.value, () => {
    if (drawer.value) {
      drawer.value = false
    }
  })

  // Close drawer when switching from mobile to desktop
  watch(lgAndUp, (newLgAndUp, oldLgAndUp) => {
    if (!oldLgAndUp && newLgAndUp && drawer.value) {
      drawer.value = false
    }
  })

  onMounted(() => {
    window.addEventListener('scroll', handleScroll)
  })

  onUnmounted(() => {
    window.removeEventListener('scroll', handleScroll)
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
    <!-- Floating Navbar using v-app-bar with Vuetify positioning -->
    <v-app-bar
      :elevation="isScrolled ? 12 : 8"
      :height="xs ? 56 : 64"
      rounded="pill"
      position="fixed"
      class="mx-auto px-2"
      :style="{
        top: navbarPositioning.top,
        left: navbarPositioning.left,
        transform: navbarPositioning.transform,
        width: navbarPositioning.width,
        maxWidth: navbarPositioning.maxWidth,
        right: navbarPositioning.right,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }"
    >
      <!-- Logo Section with Badge -->
      <template #prepend>
        <div class="d-flex align-center">
          <v-badge
            content="V3"
            color="success"
            dot
            offset-x="8"
            offset-y="8"
            class="me-2"
          >
            <!-- Logo Image with Icon Fallback -->
            <template v-if="navbarConfig.logo?.src">
              <v-img
                :src="navbarConfig.logo.src"
                :alt="navbarConfig.logo.alt"
                :width="navbarConfig.logo.width || 42"
                :height="navbarConfig.logo.height || 42"
                contain
              >
                <template #error>
                  <!-- Fallback to avatar with icon if image fails to load -->
                  <v-avatar
                    :color="navbarConfig.color"
                    size="42"
                  >
                    <v-icon
                      :icon="navbarConfig.icon"
                      size="22"
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
                size="42"
              >
                <v-icon
                  :icon="navbarConfig.icon"
                  size="22"
                  color="white"
                />
              </v-avatar>
            </template>
          </v-badge>

          <!-- Hide title on mobile to minimize navbar -->
          <div class="d-flex flex-column ms-2 d-none d-md-flex">
            <span class="text-subtitle-1 font-weight-bold text-primary">
              {{ navbarConfig.title }}
            </span>
            <span class="text-caption text-medium-emphasis">
              Academic Excellence
            </span>
          </div>
        </div>
      </template>

      <v-spacer />

      <!-- Desktop Actions -->
      <template #append>
      <div class="d-flex align-center" v-if="lgAndUp">
          <!-- Theme Toggle Menu -->
          <v-menu location="bottom">
            <template #activator="{ props: menuProps }">
              <v-btn
                v-bind="menuProps"
                :loading="isLoadingTheme"
                variant="outlined"
                rounded="pill"
                size="large"
                :prepend-icon="themeIcon"
              >
                <span>Theme</span>
              </v-btn>
            </template>

            <v-card width="200" class="mt-2">
              <v-list density="compact">
                <v-list-item
                  prepend-icon="mdi-white-balance-sunny"
                  title="Light Mode"
                  :active="currentTheme === 'light'"
                  @click="currentTheme === 'dark' && toggleTheme()"
                />
                <v-list-item
                  prepend-icon="mdi-weather-night"
                  title="Dark Mode"
                  :active="currentTheme === 'dark'"
                  @click="currentTheme === 'light' && toggleTheme()"
                />
              </v-list>
            </v-card>
          </v-menu>

          <!-- User Slug Name Component -->
          <SlugName class="ml-2" />
        </div>

        <!-- Mobile Menu Button -->
        <v-btn
          v-if="!lgAndUp"
          icon="mdi-menu"
          variant="text"
          :size="xs ? 'default' : 'large'"
          @click="drawer = !drawer"
        />
      </template>
    </v-app-bar>

    <!-- Mobile Navigation Drawer -->
    <v-navigation-drawer
      v-model="drawer"
      :temporary="!lgAndUp"
      :permanent="false"
      location="start"
      :width="280"
      :scrim="true"
      :elevation="24"
      absolute
      class="pa-0"
      style="position: fixed !important; z-index: 9999 !important; top: 0 !important; left: 0 !important; height: 100vh !important;"
    >
      <!-- Drawer Header with Logo and Title -->
      <template #prepend>
        <v-card flat class="px-4 py-6">
          <div class="d-flex align-center">
            <v-badge
              content="V3"
              color="success"
              dot
              offset-x="8"
              offset-y="8"
              class="me-3"
            >
              <!-- Logo Image with Icon Fallback -->
              <template v-if="navbarConfig.logo?.src">
                <v-img
                  :src="navbarConfig.logo.src"
                  :alt="navbarConfig.logo.alt"
                  :width="navbarConfig.logo.width || 48"
                  :height="navbarConfig.logo.height || 48"
                  contain
                >
                  <template #error>
                    <!-- Fallback to avatar with icon if image fails to load -->
                    <v-avatar
                      :color="navbarConfig.color"
                      size="48"
                    >
                      <v-icon
                        :icon="navbarConfig.icon"
                        size="24"
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
                  size="48"
                >
                  <v-icon
                    :icon="navbarConfig.icon"
                    size="24"
                    color="white"
                  />
                </v-avatar>
              </template>
            </v-badge>

            <div class="d-flex flex-column">
              <span class="text-h6 font-weight-bold text-primary">
                {{ navbarConfig.title }}
              </span>
              <span class="text-caption text-medium-emphasis">
                Academic Excellence
              </span>
            </div>
          </div>

          <!-- Close Button -->
          <v-btn
            icon="mdi-close"
            variant="text"
            size="small"
            class="position-absolute"
            style="top: 16px; right: 16px;"
            @click="drawer = false"
          />
        </v-card>
        <v-divider />
      </template>

      <!-- Navigation List -->
      <v-list nav class="py-0">
        <!-- Loading State -->
        <div v-if="isLoading" class="text-center py-4">
          <v-progress-circular indeterminate color="primary" size="32" />
          <p class="text-body-2 mt-2">Loading navigation...</p>
        </div>

        <!-- No Access Message -->
        <div v-else-if="navigationGroups.length === 0" class="text-center py-6">
          <v-icon color="grey" size="48" class="mb-2">mdi-lock-outline</v-icon>
          <p class="text-body-2 text-grey">No accessible pages</p>
          <p class="text-caption text-grey">Contact your administrator</p>
        </div>

        <!-- Dynamic Navigation Groups (permission filtered) -->
        <template v-else>
          <template v-for="group in navigationGroups" :key="group.title">
            <v-list-group :value="group.title">
              <template #activator="{ props: activatorProps }">
                <v-list-item
                  v-bind="activatorProps"
                  :prepend-icon="group.icon"
                  :title="group.title"
                  rounded="xl"
                  class="ma-2"
                />
              </template>

              <v-list-item
                v-for="item in group.children"
                :key="item.route"
                :prepend-icon="item.icon"
                :title="item.title"
                :to="item.route"
                rounded="xl"
                class="ma-2 ms-4"
                @click="drawer = false"
              />
            </v-list-group>
          </template>
        </template>

        <v-divider class="my-2 mx-4" />

        <!-- Theme Toggle -->
        <v-list-group value="Theme">
          <template #activator="{ props: activatorProps }">
            <v-list-item
              v-bind="activatorProps"
              :prepend-icon="themeIcon"
              title="Theme"
              :subtitle="`Current: ${currentTheme === 'dark' ? 'Dark' : 'Light'} Mode`"
              rounded="xl"
              class="ma-2"
            />
          </template>

          <v-list-item
            prepend-icon="mdi-white-balance-sunny"
            title="Light Mode"
            :active="currentTheme === 'light'"
            rounded="xl"
            class="ma-2 ms-4"
            @click="currentTheme === 'dark' && toggleTheme()"
          />
          <v-list-item
            prepend-icon="mdi-weather-night"
            title="Dark Mode"
            :active="currentTheme === 'dark'"
            rounded="xl"
            class="ma-2 ms-4"
            @click="currentTheme === 'light' && toggleTheme()"
          />
        </v-list-group>
      </v-list>

      <!-- User Menu -->
      <template #append>
        <div class="pa-4">
          <SlugName :show-inline-logout="true" />
        </div>
      </template>
    </v-navigation-drawer>

  </div>
</template>

<style scoped>
/* All styling handled by Vuetify components and utilities only */
</style>
