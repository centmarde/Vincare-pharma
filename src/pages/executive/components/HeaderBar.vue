<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { fetchRandomVerse, type BibleVerse } from '../composables/bibleVerse'
import { navigationConfig, flattenNavigationItems } from '@/utils/navigation'
import type { NavigationChild } from '@/utils/navigation'

const router = useRouter()

const verse = ref<BibleVerse | null>(null)
const verseLoading = ref(true)
onMounted(async () => {
  verse.value = await fetchRandomVerse()
  verseLoading.value = false
})

const searchQuery = defineModel<string>('search')

interface NavSearchItem {
  title: string
  icon: string
  route: string
  group: string
}

// Flatten navigation items into a searchable list for v-autocomplete
const navItems = computed<NavSearchItem[]>(() => {
  const allChildren: NavigationChild[] = []
  for (const group of navigationConfig) {
    allChildren.push(...group.children)
  }
  return flattenNavigationItems(allChildren).map(item => ({
    title: item.title,
    icon: item.icon,
    route: item.route,
    group: item.keywords || '',
  }))
})

// The autocomplete's slot item is Vuetify's wrapper (carrying .raw) only when
// Volar infers its generic item param; accept either shape so the icon/group
// lookup doesn't depend on that inference resolving.
function getRaw(item: NavSearchItem | { raw: NavSearchItem }): NavSearchItem {
  return 'raw' in item ? item.raw : item
}

function goToRoute(route: string | null) {
  if (route) {
    searchQuery.value = ''
    router.push(route)
  }
}
</script>

<template>
  <v-card class="rounded-xl mb-4 header-bar" elevation="0">
    <v-card-text class="pa-3 pa-md-4">
      <div class="d-flex align-center flex-wrap ga-3">
        <!-- Bible Verse (left) -->
        <div
          class="d-flex align-center ga-2"
          style="min-width: 200px; max-width: 500px; flex: 1 1 auto"
        >
          <v-icon icon="mdi-book-open-variant" color="primary" size="20" class="flex-shrink-0" />
          <div v-if="verseLoading" class="text-caption text-medium-emphasis">Loading verse...</div>
          <div v-else-if="verse" class="text-caption" style="line-height: 1.4">
            <span class="font-weight-medium">"{{ verse.text }}"</span>
            <span class="text-medium-emphasis"> — {{ verse.reference }}</span>
          </div>
          <div v-else class="text-caption text-medium-emphasis">
            "Trust in the Lord with all your heart" — Proverbs 3:5
          </div>
        </div>

        <v-spacer />

        <!-- Search with v-autocomplete (right) -->
        <div
          class="d-flex align-center ga-2"
          style="min-width: 180px; max-width: 360px; flex: 1 1 auto"
        >
          <v-autocomplete
            v-model="searchQuery"
            :items="navItems"
            item-title="title"
            item-value="route"
            placeholder="Search pages..."
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            hide-details
            clearable
            hide-no-data
            autocomplete="off"
            class="search-input"
            @update:model-value="goToRoute"
          >
            <template #item="{ props, item }">
              <v-list-item v-bind="props" class="rounded-lg">
                <template #prepend>
                  <v-icon :icon="getRaw(item).icon" size="18" color="primary" class="mr-2" />
                </template>
                <v-list-item-subtitle class="text-caption text-medium-emphasis">
                  {{ getRaw(item).group }}
                </v-list-item-subtitle>
                <template #append>
                  <v-icon size="14" color="grey">mdi-arrow-right-thin</v-icon>
                </template>
              </v-list-item>
            </template>
          </v-autocomplete>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>
