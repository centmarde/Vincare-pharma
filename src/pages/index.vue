<script lang="ts" setup>
  import { onMounted } from 'vue'
  import { useLandingController } from '@/controller/landingController'
  import OuterLayoutWrapper from '@/layouts/OuterLayoutWrapper.vue'

  const { data, loading, error, fetchLandingData } = useLandingController()

  onMounted(async () => {
    await fetchLandingData()
  })

  function scrollToFeatures () {
    const element = document.querySelector('#features')
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }
  }

  function openGithub () {
    window.open('https://github.com', '_blank', 'noopener,noreferrer')
  }

  function openDocumentation () {
    window.open('https://vuetifyjs.com/', '_blank', 'noopener,noreferrer')
  }

  function formatDate (dateString: string) {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }
</script>

<template>
  <OuterLayoutWrapper>
    <template #content>
      <div class="landing-view">
        <!-- Loading State -->
        <v-container
          v-if="loading"
          class="d-flex justify-center align-center"
          style="min-height: 50vh"
        >
          <v-progress-circular color="primary" indeterminate size="64" />
        </v-container>

        <!-- Error State -->
        <v-container
          v-else-if="error"
          class="d-flex justify-center align-center"
          style="min-height: 50vh"
        >
          <v-alert
            color="error"
            icon="mdi-alert-circle"
            type="error"
            variant="tonal"
          >
            <v-alert-title>Failed to load content</v-alert-title>
            {{ error }}
          </v-alert>
        </v-container>

        <!-- Content -->
        <div v-else-if="data">
          <!-- Hero Section -->
          <section class="hero-section">
            <v-container>
              <v-row align="center" class="min-height-screen" justify="center">
                <v-col cols="12" lg="8" md="10">
                  <div class="text-center">
                    <h1 class="text-h2 text-md-h3 font-weight-bold mb-4">
                      {{ data.title }}
                    </h1>

                    <h2 class="text-h4 text-md-h4 text-grey-darken-1 mb-6">
                      {{ data.subtitle }}
                    </h2>

                    <p class="text-h6 text-md-h6 text-grey-darken-2 mb-8">
                      {{ data.description }}
                    </p>

                    <div
                      class="d-flex flex-column flex-sm-row gap-4 justify-center"
                    >
                      <v-btn
                        class="text-none"
                        color="primary"
                        size="x-large"
                        variant="elevated"
                        @click="scrollToFeatures"
                      >
                        <v-icon class="me-2" icon="mdi-rocket-launch" />
                        Explore Features
                      </v-btn>

                      <v-btn
                        class="text-none"
                        color="primary"
                        size="x-large"
                        variant="outlined"
                        @click="openGithub"
                      >
                        <v-icon class="me-2" icon="mdi-github" />
                        View Source
                      </v-btn>
                    </div>
                  </div>
                </v-col>
              </v-row>
            </v-container>
          </section>

          <!-- Features Section -->
          <section id="features" class="features-section py-16">
            <v-container>
              <div class="text-center mb-12">
                <h2 class="text-h3 font-weight-bold mb-4">Key Features</h2>
                <p class="text-h6 text-grey-darken-1">
                  Everything you need for modern academic writing
                </p>
              </div>

              <v-row>
                <v-col
                  v-for="(feature, index) in data.features"
                  :key="index"
                  cols="12"
                  lg="3"
                  md="6"
                >
                  <v-card class="h-100" elevation="2" hover>
                    <v-card-text class="text-center pa-6">
                      <v-avatar class="mb-4" color="primary" size="64">
                        <v-icon color="on-primary" :icon="feature.icon" size="32" />
                      </v-avatar>

                      <h3 class="text-h5 font-weight-bold mb-3">
                        {{ feature.title }}
                      </h3>

                      <p class="text-body-1 text-grey-darken-3">
                        {{ feature.description }}
                      </p>
                    </v-card-text>
                  </v-card>
                </v-col>
              </v-row>
            </v-container>
          </section>

          <!-- About Section -->
          <section id="about" class="about-section py-16 ">
            <v-container>
              <v-row align="center" justify="center">
                <v-col cols="12" lg="8" md="10">
                  <div class="text-center">
                    <h2 class="text-h3 font-weight-bold mb-6">
                      About This Template
                    </h2>

                    <div class="pa-8" elevation="4">
                      <v-row align="center">
                        <v-col cols="12" md="8">
                          <h3 class="text-h4 font-weight-bold mb-4">
                            Version {{ data.version }}
                          </h3>
                          <p class="text-h6 text-grey-darken-1 mb-4">
                            Created by {{ data.author }}
                          </p>
                          <p class="text-body-1 text-grey-darken-2">
                            Last updated: {{ formatDate(data.lastUpdated) }}
                          </p>
                        </v-col>

                        <v-col cols="12" md="4">
                          <v-btn
                            block
                            class="text-none"
                            color="primary"
                            size="large"
                            variant="elevated"
                            @click="openDocumentation"
                          >
                            <v-icon class="me-2" icon="mdi-book-open" />
                            Documentation
                          </v-btn>
                        </v-col>
                      </v-row>
                    </div>
                  </div>
                </v-col>
              </v-row>
            </v-container>
          </section>
        </div>
      </div>
    </template>
  </OuterLayoutWrapper>
</template>

<style scoped>

.min-height-screen {
  min-height: calc(100vh - 64px);
}

/* .features-section {
  background: white;
} */

/* .about-section {
  background: #fafafa;
} */

.gap-4 {
  gap: 1rem;
}

.landing-view {
  min-height: 100vh;
}
</style>
