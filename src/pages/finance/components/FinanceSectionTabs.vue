<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { navigationConfig, isNavigationItem } from '@/utils/navigation'
import type { NavigationItem } from '@/utils/navigation'
import { useUserPermissions } from '@/composables/useUserPermissions'

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
</script>

<template>
  <v-tabs
    v-if="tabs.length > 1"
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
</template>
