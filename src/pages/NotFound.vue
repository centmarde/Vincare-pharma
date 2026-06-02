<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useTheme } from "vuetify";
import { createDynamicThemeConfigFromExternal } from "@/themes/index";

// Composables
const router = useRouter();
const theme = useTheme();

// Reactive state
const themeLoading = ref(true);
const themeError = ref<string | null>(null);

// Methods
const navigateHome = () => {
  router.push("/");
};

const goBack = () => {
  router.go(-1);
};

// Load dynamic theme configuration
const loadDynamicTheme = async () => {
  try {
    themeLoading.value = true;
    themeError.value = null;

    const themeConfig = await createDynamicThemeConfigFromExternal();

    // Apply the theme configuration to Vuetify
    theme.themes.value.light = themeConfig.themes.light;
    theme.themes.value.dark = themeConfig.themes.dark;

    console.log('Dynamic theme loaded successfully');
  } catch (error) {
    console.error('Failed to load dynamic theme:', error);
    themeError.value = error instanceof Error ? error.message : 'Failed to load theme';
  } finally {
    themeLoading.value = false;
  }
};

// Lifecycle
onMounted(async () => {
  // Load dynamic theme configuration
  await loadDynamicTheme();
});
</script>

<template>
  <!-- Theme Loading State -->
  <v-overlay v-if="themeLoading" class="d-flex align-center justify-center">
    <v-progress-circular
      indeterminate
      size="64"
      color="primary"
    />
    <div class="text-h6 ml-4">Loading theme...</div>
  </v-overlay>

  <!-- Theme Error State -->
  <v-alert
    v-if="themeError && !themeLoading"
    type="error"
    class="ma-4"
    closable
    @click:close="themeError = null"
  >
    <v-alert-title>Theme Loading Error</v-alert-title>
    {{ themeError }}
  </v-alert>

  <!-- Main Content -->
  <v-container v-if="!themeLoading" fluid class="fill-height">
    <v-row align="center" justify="center" class="fill-height">
      <v-col cols="12" sm="8" md="6" lg="4">
        <v-container class="mx-auto text-center" elevation="8" rounded="lg">
          <v-card-text class="py-8">
            <!-- 404 Icon -->
            <v-icon
              size="120"
              color="primary"
              class="mb-4"
            >
              mdi-file-question-outline
            </v-icon>

            <!-- Error Code -->
            <div class="text-h1 font-weight-bold text-primary mb-2">
              404
            </div>

            <!-- Error Title -->
            <div class="text-h4 font-weight-light mb-4 text-primary">
              Page Not Found
            </div>

            <!-- Error Description -->
            <div class="text-body-1 text-medium-emphasis mb-6">
              Oops! The page you're looking for doesn't exist. It might have been moved,
              deleted, or you entered the wrong URL.
            </div>

            <!-- Helpful Suggestions -->
            <v-alert
              type="info"
              variant="tonal"
              class="mb-6 text-left"
              icon="mdi-lightbulb-outline"
            >
              <v-alert-title class="text-h6">What you can do:</v-alert-title>
              <ul class="mt-2">
                <li>Check the URL for any typos</li>
                <li>Go back to the previous page</li>
                <li>Visit our homepage to start fresh</li>
                <li>Use the navigation menu to find what you need</li>
              </ul>
            </v-alert>

            <!-- Action Buttons -->
            <v-row no-gutters justify="center" class="mb-4">
              <v-col cols="auto" class="mx-2">
                <v-btn
                  color="primary"
                  variant="elevated"
                  size="large"
                  prepend-icon="mdi-home"
                  @click="navigateHome"
                >
                  Go Home
                </v-btn>
              </v-col>
              <v-col cols="auto" class="mx-2">
                <v-btn
                  color="secondary"
                  variant="outlined"
                  size="large"
                  prepend-icon="mdi-arrow-left"
                  @click="goBack"
                >
                  Go Back
                </v-btn>
              </v-col>
            </v-row>

            <!-- Additional Help -->
            <div class="text-caption text-medium-emphasis">
              Need help? Contact our support team.
            </div>
          </v-card-text>
        </v-container>
      </v-col>
    </v-row>

    <!-- Background Pattern (Optional) -->
    <div class="background-pattern">
      <v-row no-gutters class="fill-height">
        <v-col
          v-for="i in 20"
          :key="i"
          cols="1"
          class="d-flex align-center justify-center"
        >
          <v-icon
            :size="Math.random() * 30 + 10"
            :color="`primary`"
            :style="{
              opacity: Math.random() * 0.1 + 0.02,
              transform: `rotate(${Math.random() * 360}deg)`
            }"
          >
            mdi-school
          </v-icon>
        </v-col>
      </v-row>
    </div>
  </v-container>
</template>

<style scoped>
.background-pattern {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: -1;
  pointer-events: none;
  overflow: hidden;
}

.v-card {
  position: relative;
  z-index: 1;
}
</style>
