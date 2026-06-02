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
const navigateToDashboard = () => {
  router.push("/account/home");
};

const goBack = () => {
  router.go(-1);
};

const navigateHome = () => {
  router.push("/");
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
            <!-- 403 Icon -->
            <v-icon
              size="120"
              color="error"
              class="mb-4"
            >
              mdi-lock-outline
            </v-icon>

            <!-- Error Code -->
            <div class="text-h1 font-weight-bold text-error mb-2">
              403
            </div>

            <!-- Error Title -->
            <div class="text-h4 font-weight-light mb-4 text-error">
              Access Forbidden
            </div>

            <!-- Error Description -->
            <div class="text-body-1 text-medium-emphasis mb-6">
              You don't have permission to access this resource. This might be because
              your user role doesn't include access to this page, or your session has expired.
            </div>

            <!-- Helpful Suggestions -->
            <v-alert
              type="warning"
              variant="tonal"
              class="mb-6 text-left"
              icon="mdi-information-outline"
            >
              <v-alert-title class="text-h6">What you can do:</v-alert-title>
              <ul class="mt-2">
                <li>Contact your administrator to request access</li>
                <li>Check if you're logged in with the correct account</li>
                <li>Go back to the previous page</li>
                <li>Return to the dashboard</li>
              </ul>
            </v-alert>

            <!-- Action Buttons -->
            <v-row no-gutters justify="center" class="mb-4">
              <v-col cols="auto" class="mx-2">
                <v-btn
                  color="primary"
                  variant="elevated"
                  size="large"
                  prepend-icon="mdi-view-dashboard"
                  @click="navigateToDashboard"
                >
                  Dashboard
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
              Need access? Contact your system administrator.
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
            :color="`error`"
            :style="{
              opacity: Math.random() * 0.1 + 0.02,
              transform: `rotate(${Math.random() * 360}deg)`
            }"
          >
            mdi-lock
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
