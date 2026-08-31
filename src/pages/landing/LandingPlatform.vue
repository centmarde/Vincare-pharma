<script lang="ts" setup>
import type { LandingData } from '@/controller/landingController'

defineProps<{ data: LandingData }>()

/** Wraps the last word of a title in the red-italic accent, e.g.
 *  "One system from purchase order to collection" → "...to <em>collection</em>" */
const titleAccent = (data: LandingData) => {
  const text = data.title
  const lastSpace = text.lastIndexOf(' ')
  if (lastSpace === -1) return { before: text, last: '' }
  return { before: text.slice(0, lastSpace), last: text.slice(lastSpace + 1) }
}
</script>

<template>
  <!-- Platform section is JSON-driven; the data source is unchanged -->
  <section id="features" class="section">
    <v-container>
      <div class="section-head mb-12">
        <div class="section-eyebrow mb-3">The Platform</div>
                        <h2 class="section-title section-title-display mb-4">
          {{ titleAccent(data).before }} <em class="section-title-accent">{{ titleAccent(data).last }}</em>
        </h2>
        <p class="section-lead">{{ data.subtitle }}</p>
      </div>

      <v-row>
        <v-col
          v-for="feature in data.features"
          :key="feature.title"
          cols="12"
          md="4"
        >
          <div class="feature h-100">
            <div class="feature-icon mb-5">
              <v-icon :icon="feature.icon" size="24" />
            </div>
            <h3 class="feature-title mb-3">{{ feature.title }}</h3>
            <p class="feature-body">{{ feature.description }}</p>
          </div>
        </v-col>
      </v-row>
    </v-container>
  </section>
</template>