
<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useTheme } from "vuetify";
import LoginForm from "@/components/auth/LoginForm.vue";
import RegisterForm from "@/components/auth/RegisterForm.vue";
import { useAuthUserStore } from "@/stores/authUser";
import { createDynamicThemeConfigFromExternal } from "@/themes/index";
import { useAuthPageController } from "@/controller/authPageController";

// Composables
const router = useRouter();
const route = useRoute();
const authStore = useAuthUserStore();
const theme = useTheme();
const { data: authPageData, loading: authPageLoading, error: authPageError, fetchAuthPageData } = useAuthPageController();

// Reactive state
const isLoginMode = ref(true);
const themeLoading = ref(true);
const themeError = ref<string | null>(null);

// Computed properties for layout
const isQuoteOnLeft = computed(() => {
  return authPageData.value?.layout?.quotePosition === 'left';
});

const formSectionOrder = computed(() => {
  return isQuoteOnLeft.value ? 2 : 1;
});

const quoteSectionOrder = computed(() => {
  return isQuoteOnLeft.value ? 1 : 2;
});

// Methods
const switchToRegister = () => {
  isLoginMode.value = false;
  // Update URL without navigation
  router.replace({ query: { mode: "register" } });
};

const switchToLogin = () => {
  isLoginMode.value = true;
  // Update URL without navigation
  router.replace({ query: { mode: "login" } });
};

const toggleMode = () => {
  if (isLoginMode.value) {
    switchToRegister();
  } else {
    switchToLogin();
  }
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
  // Load auth page data first
  await fetchAuthPageData();

  // Load dynamic theme configuration
  await loadDynamicTheme();

  // Set initial mode based on query parameter
  const mode = route.query.mode;
  if (mode === "register") {
    isLoginMode.value = false;
  } else {
    isLoginMode.value = true;
  }
});

// This page uses the default layout and doesn't require authentication
</script>



<template>

  <!-- Theme Loading State -->
  <v-overlay v-if="themeLoading || authPageLoading" class="d-flex align-center justify-center">
    <v-progress-circular
      indeterminate
      size="64"
      color="primary"
    />
    <div class="text-h6 ml-4">
      {{ themeLoading ? 'Loading theme...' : 'Loading page data...' }}
    </div>
  </v-overlay>

  <!-- Error State -->
  <v-alert
    v-if="(themeError || authPageError) && !themeLoading && !authPageLoading"
    type="error"
    class="ma-4"
    closable
    @click:close="themeError = null"
  >
    <v-alert-title>Loading Error</v-alert-title>
    {{ themeError || authPageError }}
  </v-alert>

  <!-- Main Content -->
  <v-row v-if="!themeLoading && !authPageLoading && authPageData" class="fill-height" align="center" no-gutters>
    <!-- Form Section -->

    <v-col
      cols="12"
      lg="5"
      class="bg-primary d-flex align-center justify-center fill-height"
      :order="formSectionOrder"
    >

      <div class="w-100" style="max-width: 500px">
         <!-- Back to Home Button (static) -->
            <v-btn
              variant="text"
              color="light"
              size="small"
              class="ma-2"
              @click="navigateHome"
            >
              <v-icon start size="small">mdi-arrow-left</v-icon>
              Back to Home
            </v-btn>
        <!-- Auth Form Container -->
        <v-fade-transition mode="out-in">
          <div v-if="isLoginMode" key="login">
            <LoginForm @switch-to-register="switchToRegister" />
          </div>
          <div v-else key="register">
            <RegisterForm @switch-to-login="switchToLogin" />
          </div>
        </v-fade-transition>

        <!-- Additional Options -->
        <v-card class="mt-4" variant="text">
          <v-card-text class="text-center">
            <v-divider class="mb-4" />

            <div class="text-body-2 text-medium-emphasis mb-2">
              Or continue with
            </div>

            <!-- Social Login Options (static) -->
            <v-row no-gutters justify="center">
              <v-col cols="auto">
                <v-btn
                  variant="outlined"
                  color="light"
                  size="small"
                  disabled
                  class="mx-1"
                >
                  <v-icon start>mdi-google</v-icon>
                  Google
                </v-btn>
              </v-col>
              <v-col cols="auto">
                <v-btn
                  variant="outlined"
                  color="light"
                  size="small"
                  disabled
                  class="mx-1"
                >
                  <v-icon start>mdi-github</v-icon>
                  GitHub
                </v-btn>
              </v-col>
            </v-row>

                <div class="text-caption text-medium-emphasis mt-2">
              Social login coming soon
            </div>
          </v-card-text>
        </v-card>

        <!-- Toggle Mode Button (static) -->
        <v-card class="mx-auto mt-2" variant="text">
          <v-card-actions class="justify-center">

            <v-btn
              variant="text"
              color="light"
              size="small"
              @click="toggleMode"
            >
              <v-icon start>mdi-swap-horizontal</v-icon>
              Switch to {{ isLoginMode ? "Register" : "Login" }}
            </v-btn>

          </v-card-actions>

        </v-card>
      </div>

    </v-col>

    <!-- Quote Section -->
    <v-col
      cols="12"
      lg="7"
      class="d-none d-lg-flex align-center justify-center fill-height"
      :order="quoteSectionOrder"
    >
      <v-card-text class="text-center">
        <v-icon size="48" color="primary" class="mb-4 d-flex justify-start">
          mdi-format-quote-open
        </v-icon>

        <div class="text-h4 font-weight-light mb-6 text-primary">
          {{ authPageData.quote.text }}
        </div>

        <div class="text-h6 text-primary opacity-75">
          — {{ authPageData.quote.author }}
          <span v-if="authPageData.quote.source" class="text-caption">
            ({{ authPageData.quote.source }})
          </span>
        </div>

        <div v-if="authPageData.quote.motivationalText" class="text-body-1 text-primary opacity-75">
          {{ authPageData.quote.motivationalText }}
        </div>
      </v-card-text>

    </v-col>
  </v-row>
</template>
