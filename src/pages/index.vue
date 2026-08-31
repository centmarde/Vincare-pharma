<script lang="ts" setup>
import { onMounted } from 'vue'
import { useLandingController } from '@/controller/landingController'
import OuterLayoutWrapper from '@/layouts/OuterLayoutWrapper.vue'
import LandingHero from './landing/LandingHero.vue'
import LandingCredentials from './landing/LandingCredentials.vue'
import LandingChannels from './landing/LandingChannels.vue'
import LandingAssurances from './landing/LandingAssurances.vue'
import LandingPlatform from './landing/LandingPlatform.vue'
import LandingGroup from './landing/LandingGroup.vue'
import LandingContact from './landing/LandingContact.vue'
import LandingClosing from './landing/LandingClosing.vue'

const { data, loading, error, fetchLandingData } = useLandingController()

onMounted(async () => {
  await fetchLandingData()
})

function scrollTo(id: string) {
  document.querySelector(`#${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <OuterLayoutWrapper>
    <template #content>
      <div class="landing">
        <v-container
          v-if="loading"
          class="d-flex justify-center align-center"
          style="min-height: 60vh"
        >
          <v-progress-circular color="primary" indeterminate size="56" />
        </v-container>

        <v-container
          v-else-if="error"
          class="d-flex justify-center align-center"
          style="min-height: 60vh"
        >
          <v-alert type="error" variant="tonal" icon="mdi-alert-circle">
            <v-alert-title>Failed to load content</v-alert-title>
          </v-alert>
        </v-container>

        <div v-else-if="data">
          <LandingHero @scroll="scrollTo" />
          <LandingCredentials />
          <LandingChannels />
          <LandingAssurances />
          <LandingPlatform :data="data" />
          <LandingGroup />
          <LandingContact />
          <LandingClosing />
        </div>
      </div>
    </template>
  </OuterLayoutWrapper>
</template>

<style>
@import url('./css/landing.css');
</style>
