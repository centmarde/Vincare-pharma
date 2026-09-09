<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useDisplay } from 'vuetify'
import { navigationConfig, isNavigationItem } from '@/utils/navigation'
import type { NavigationItem } from '@/utils/navigation'
import { useUserPermissions } from '@/composables/useUserPermissions'

// Responsive: show the tab bar on desktop, a burger menu on small screens.
const { mobile } = useDisplay()

// Renders the v-tabs bar for a finance section (Income Statement / Balance
// Sheet). The section is inferred from the current route: we find the finance
// sub-group (a routed sub-group whose children were collapsed into one sidebar
// link) that contains this route, then show its children as tabs — filtered to
// the ones the current role can access. On any non-tabbed finance page (Trial
// Balance, General Journal) nothing renders, so it's safe to drop in anywhere.
const route = useRoute()
const { hasAccessToRoute } = useUserPermissions()

const tabs = computed<NavigationItem[]>(() => {
  for (const group of navigationConfig) {
    for (const child of group.children) {
      if (isNavigationItem(child) || !child.route) continue
      if (child.children.some((item) => item.route === route.path)) {
        return child.children.filter((item) => hasAccessToRoute(item.route))
      }
    }
  }
  return []
})

// Title of the section currently active, for the mobile menu label.
const currentTabTitle = computed(() => tabs.value.find((tab) => tab.route === route.path)?.title ?? '')
</script>

<template>
  <!-- Desktop: tab bar -->
  <v-tabs
    v-if="tabs.length > 1 && !mobile"
    :model-value="route.path"
    color="primary"
    density="comfortable"
    show-arrows
    class="mb-4"
  >
    <v-tab
      v-for="tab in tabs"
      :key="tab.route"
      :value="tab.route"
      :to="tab.route"
      :prepend-icon="tab.icon"
    >
      {{ tab.title }}
    </v-tab>
  </v-tabs>

  <!-- Mobile: burger menu -->
  <v-menu v-else-if="tabs.length > 1" :close-on-content-click="true" location="bottom start" class="mb-4">
    <template #activator="{ props: menuProps }">
      <div class="d-flex align-center ga-2 mb-4">
        <v-btn
          v-bind="menuProps"
          icon="mdi-menu"
          variant="outlined"
          color="primary"
          size="small"
        />
        <span class="text-body-2 text-medium-emphasis">
          {{ currentTabTitle || 'Select section' }}
        </span>
      </div>
    </template>

    <v-card min-width="220" class="mt-2">
      <v-list density="compact" nav>
        <v-list-item
          v-for="tab in tabs"
          :key="tab.route"
          :to="tab.route"
          :prepend-icon="tab.icon"
          :title="tab.title"
          :active="tab.route === route.path"
          rounded="xl"
        />
      </v-list>
    </v-card>
  </v-menu>
</template>
