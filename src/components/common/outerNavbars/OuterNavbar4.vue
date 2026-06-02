<script lang="ts" setup>
  import type { CTAButton, NavigationItem, UIConfig, LogoConfig } from '@/controller/landingController'
  import { computed, ref, onMounted, onUnmounted } from 'vue'
  import { useRouter } from 'vue-router'
  import { useTheme } from '@/composables/useTheme'
  import { useDisplay } from 'vuetify'

  interface Props {
    config?: UIConfig | null
  }

  const props = defineProps<Props>()
  const router = useRouter()

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

  function handleNavigation (item: NavigationItem) {
    // Close mobile drawer after navigation on mobile
    if (mobile.value) {
      mobileDrawer.value = false
    }

    switch (item.action) {
      case 'scroll': {
        scrollToSection(item.target)
        break
      }
      case 'navigate': {
        router.push(item.target)
        break
      }
      case 'external': {
        window.open(item.target, '_blank', 'noopener,noreferrer')
        break
      }
    }
  }

  function handleCTAAction (button: CTAButton) {
    // Close mobile drawer after CTA action on mobile
    if (mobile.value) {
      mobileDrawer.value = false
    }

    switch (button.action) {
      case 'scroll': {
        scrollToSection(button.target)
        break
      }
      case 'navigate': {
        router.push(button.target)
        break
      }
      case 'external': {
        window.open(button.target, '_blank', 'noopener,noreferrer')
        break
      }
    }
  }

  function scrollToSection (sectionId: string) {
    const element = document.querySelector(`#${sectionId}`)
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
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

      <!-- Desktop Navigation Menu -->
      <div class="d-none d-md-flex align-center mx-4">
        <v-btn
          v-for="(item, index) in navbarConfig.navigationItems"
          :key="item.label"
          variant="text"
          :color="index === 0 ? 'primary' : 'default'"
          :prepend-icon="`mdi-${index === 0 ? 'star-outline' : 'information-outline'}`"
          class="mx-2 nav-item"
          rounded="lg"
          @click="handleNavigation(item)"
        >
          {{ item.label }}
        </v-btn>
      </div>

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

          <!-- CTA Button -->
          <v-btn
            v-if="navbarConfig.ctaButton"
            :color="navbarConfig.ctaButton.color"
            :variant="navbarConfig.ctaButton.variant"
            size="large"
            prepend-icon="mdi-rocket-launch-outline"
            rounded="lg"
            class="me-2 cta-button"
            @click="handleCTAAction(navbarConfig.ctaButton)"
          >
            {{ navbarConfig.ctaButton.label }}
          </v-btn>
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

      <!-- Mobile Navigation Items -->
      <v-list
        nav
        density="comfortable"
        class="px-4"
      >
        <v-list-item
          v-for="(item, index) in navbarConfig.navigationItems"
          :key="item.label"
          :title="item.label"
          :prepend-icon="`mdi-${index === 0 ? 'star-outline' : 'information-outline'}`"
          rounded="xl"
          class="mb-2 mobile-nav-item"
          @click="handleNavigation(item)"
        />

        <!-- Mobile CTA Button as List Item -->
        <v-list-item
          v-if="navbarConfig.ctaButton"
          :title="navbarConfig.ctaButton.label"
          prepend-icon="mdi-rocket-launch-outline"
          rounded="xl"
          class="mb-2 mobile-nav-item mobile-cta-item"
          :class="`text-${navbarConfig.ctaButton.color}`"
          @click="handleCTAAction(navbarConfig.ctaButton)"
        />
      </v-list>

      <v-divider class="my-4 mx-4" />

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
            size="large"
            rounded="lg"
            :loading="isLoadingTheme"
            @click="toggleTheme"
          >
            {{ themeTooltip }}
          </v-btn>
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



/* Desktop Navigation Items */
.nav-item {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  text-transform: none;
  letter-spacing: 0.025em;
}

.nav-item:hover {
  background: rgba(var(--v-theme-primary), 0.08) !important;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(var(--v-theme-primary), 0.15);
}

/* CTA Button */
.cta-button {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  text-transform: none;
  font-weight: 600;
  letter-spacing: 0.025em;
}

.cta-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(var(--v-theme-primary), 0.25);
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

.mobile-nav-item {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  margin-bottom: 8px;
}

.mobile-nav-item:hover {
  background: rgba(var(--v-theme-primary), 0.08) !important;
  transform: translateX(8px);
}

.mobile-nav-item.v-list-item--active {
  background: rgba(var(--v-theme-primary), 0.12) !important;
  color: rgb(var(--v-theme-primary));
}

/* Mobile CTA Item Styling */
.mobile-cta-item {
  background: rgba(var(--v-theme-primary), 0.1) !important;
  border: 1px solid rgba(var(--v-theme-primary), 0.2);
  font-weight: 600;
}

.mobile-cta-item:hover {
  background: rgba(var(--v-theme-primary), 0.15) !important;
  transform: translateX(12px);
  box-shadow: 0 4px 8px rgba(var(--v-theme-primary), 0.2);
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

.nav-item {
  animation: fadeInUp 0.3s ease;
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
.nav-item:focus,
.cta-button:focus {
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

/* Navigation Item Indicators */
.nav-item::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 50%;
  width: 0;
  height: 2px;
  background: rgb(var(--v-theme-primary));
  transition: all 0.3s ease;
  transform: translateX(-50%);
}

.nav-item:hover::after {
  width: 80%;
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
