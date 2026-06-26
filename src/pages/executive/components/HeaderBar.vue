<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { fetchRandomVerse, type BibleVerse } from '../composables/bibleVerse'

const verse = ref<BibleVerse | null>(null)
const verseLoading = ref(true)
onMounted(async () => {
  verse.value = await fetchRandomVerse()
  verseLoading.value = false
})

const searchQuery = defineModel<string>('search')
</script>

<template>
  <v-card class="rounded-xl mb-4 header-bar" elevation="0">
    <v-card-text class="pa-3 pa-md-4">
      <div class="d-flex align-center flex-wrap ga-3">
        <!-- Bible Verse (left) -->
        <div
          class="d-flex align-center ga-2"
          style="min-width: 200px; max-width: 500px; flex: 1 1 auto;"
        >
          <v-icon
            icon="mdi-book-open-variant"
            color="primary"
            size="20"
            class="flex-shrink-0"
          />
          <div v-if="verseLoading" class="text-caption text-medium-emphasis">
            Loading verse...
          </div>
          <div v-else-if="verse" class="text-caption" style="line-height: 1.4">
            <span class="font-weight-medium">"{{ verse.text }}"</span>
            <span class="text-medium-emphasis"> — {{ verse.reference }}</span>
          </div>
          <div v-else class="text-caption text-medium-emphasis">
            "Trust in the Lord with all your heart" — Proverbs 3:5
          </div>
        </div>

        <v-spacer />

        <!-- Search Bar (right) -->
        <div
          class="d-flex align-center ga-2"
          style="min-width: 180px; max-width: 360px; flex: 1 1 auto;"
        >
          <v-text-field
            v-model="searchQuery"
            placeholder="Search..."
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            hide-details
            clearable
            class="search-input"
          />
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>