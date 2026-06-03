<script lang="ts" setup>
import type { UIConfig } from '@/controller/landingController'
import { computed, ref, onMounted, onUnmounted } from 'vue'

import { useTheme } from '@/composables/useTheme'
import { useDisplay } from 'vuetify'

import SlugName from './SlugName.vue'
import { useUserPermissions } from '@/composables/useUserPermissions'

interface Props {
  config?: UIConfig | null
}

const props = defineProps<Props>()

// User permissions composable (permission-based navigation)
const { getFilteredNavigationGroups, isLoading } = useUserPermissions()

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

// Get filtered navigation groups based on user permissions
const navigationGroups = computed(() => getFilteredNavigationGroups())

// Theme toggle computed properties
const currentTheme = computed(() => getCurrentTheme())
const themeIcon = computed(() => {
  return currentTheme.value === 'dark' ? 'mdi-white-balance-sunny' : 'mdi-weather-night'
})
const themeTooltip = computed(() => {
  return `Switch to ${currentTheme.value === 'dark' ? 'light' : 'dark'} theme`
})

function toggleTheme() {
  handleToggleTheme()
}
</script>

<template>
  <!-- Mobile Navigation Drawer -->
  <v-navigation-drawer
    v-if="mobile && config?.showNavbar && navbarConfig"
    v-model="mobileDrawer"
    temporary
    location="start"
    :color="navbarConfig.color"
    width="280"
    :elevation="navbarConfig.elevation"
  >
    <!-- Drawer Header with Logo/Title -->
    <div class="pa-4 d-flex align-center">
      <template v-if="navbarConfig?.logo?.src">
        <v-img
          :src="navbarConfig.logo.src"
          :alt="navbarConfig.logo.alt"
          :width="navbarConfig.logo.width"
          :height="navbarConfig.logo.height"
          class="me-2"
          contain
        >
          <template #error>
            <v-icon class="me-2" :icon="navbarConfig.icon" size="large" />
          </template>
        </v-img>
      </template>
      <template v-else>
        <v-icon class="me-2" :icon="navbarConfig?.icon" size="large" />
      </template>
      <span class="text-h6 font-weight-bold">{{ navbarConfig?.title }}</span>
    </div>

    <v-divider />

    <!-- Navigation Menu -->
    <v-list nav class="py-2">
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
              @click="mobileDrawer = false"
            />
          </v-list-group>
        </template>
      </template>

      <v-divider class="my-2 mx-4" />

      <!-- Theme Toggle -->
      <v-list-item
        :title="themeTooltip"
        :prepend-icon="themeIcon"
        rounded="xl"
        class="ma-2"
        @click="toggleTheme"
      />

      <!-- User Menu with SlugName -->
      <div class="pa-2">
        <SlugName />
      </div>
    </v-list>
  </v-navigation-drawer>

  <!-- Main Toolbar -->
  <v-toolbar
    v-if="config?.showNavbar && navbarConfig"
    :color="navbarConfig.color"
    :density="navbarConfig.density"
    :elevation="navbarConfig.elevation"
    class="navbar-toolbar"
    fixed
  >
    <template #prepend>
      <!-- Mobile Hamburger Menu -->
      <v-btn v-if="mobile" icon variant="text" @click="mobileDrawer = !mobileDrawer">
        <v-icon icon="mdi-menu" />
      </v-btn>

      <!-- Logo and Title -->
      <div class="d-flex align-center">
        <!-- Logo Image with Icon Fallback -->
        <template v-if="navbarConfig?.logo?.src">
          <v-img
            :src="navbarConfig.logo.src"
            :alt="navbarConfig.logo.alt"
            :width="navbarConfig.logo.width"
            :height="navbarConfig.logo.height"
            class="me-2"
            contain
          >
            <template #error>
              <!-- Fallback to icon if image fails to load -->
              <v-icon class="me-2" :icon="navbarConfig.icon" size="large" />
            </template>
          </v-img>
        </template>

        <template v-else>
          <!-- Default icon when no logo is configured -->
          <v-icon class="me-2" :icon="navbarConfig?.icon" size="large" />
        </template>

        <span class="text-h6 font-weight-bold ms-2">{{ navbarConfig?.title }}</span>
      </div>
    </template>

    <v-spacer />

    <!-- Desktop Actions -->
    <template #append>
      <!-- Theme Toggle Button -->
      <v-btn :loading="isLoadingTheme" size="small" variant="text" @click="toggleTheme">
        <v-icon :icon="themeIcon" />
        <v-tooltip activator="parent" location="bottom">
          {{ themeTooltip }}
        </v-tooltip>
      </v-btn>

      <!-- User Slug Name Component -->
      <SlugName />
    </template>
  </v-toolbar>
</template>

<style scoped>
/* Navbar positioning to work with sidebar */
.navbar-toolbar {
  position: fixed !important;
  top: 0 !important;
  left: 280px !important; /* Position to the right of sidebar */
  right: 0 !important;
  width: calc(100% - 280px) !important; /* Adjust width to account for sidebar */
  z-index: 1001 !important; /* Above sidebar but below overlays */
}

/* Responsive behavior for small screens */
@media (max-width: 959px) {
  .navbar-toolbar {
    left: 0 !important;
    width: 100% !important;
    z-index: 1010 !important; /* Higher z-index on mobile for mobile drawer */
  }
}

/* Mobile drawer responsive positioning */
@media (max-width: 959px) {
  .v-navigation-drawer {
    z-index: 1005 !important; /* Ensure mobile drawer is above toolbar */
  }
}
</style>
