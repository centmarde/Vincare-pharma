<script setup lang="ts">
import { computed } from 'vue'
import { useDisplay } from 'vuetify'

interface Props {
  modelValue: boolean
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// v-model support para ma-control ang visibility from the parent.
// Persistent ang dialog kay out of service gyud ang app — dili pwede i-dismiss sa user.
const internalDialog = computed({
  get: () => props.modelValue,
  set: (value: boolean) => {
    emit('update:modelValue', value)
  },
})

// Project Manager nga atbang-an para sa mga concerns.
const PROJECT_MANAGER = 'Richard Vincent Gonzales'

// Billing links para ma-settle dayon ang subscription (Supabase ug Vercel).
const SUPABASE_BILLING_URL = 'https://supabase.com/dashboard/org/_/billing'
const VERCEL_BILLING_URL = 'https://vercel.com/account/billing'

// Mobile detection para sa responsive sizing ug alignment (parehas sa IssuePOModal/PODetailModal).
const { mobile } = useDisplay()
</script>

<template>
  <v-dialog v-model="internalDialog" fullscreen persistent>
    <v-card class="out-of-services-card" rounded="0">
      <!-- Sa mobile, top-aligned ug scrollable ang content aron dili ma-cut sa screen -->
      <!-- Fluid container sa web-view: walay max-width aron mo-stretch ang content sa tibuok screen -->
      <v-container fluid class="out-of-services-body pa-4 pa-sm-6">
        <!-- Logo sa Vincare -->
        <v-img
          src="/vincare.png"
          alt="Vincare Pharma Logo"
          :width="mobile ? 88 : 120"
          :height="mobile ? 88 : 120"
          contain
          eager
          class="mb-4 mb-sm-6"
        />

        <!-- Title sa message -->
        <div class="text-center mb-4 mb-sm-6 w-100">
          <div class="d-flex align-center justify-center mb-2">
            <v-icon icon="mdi-cloud-alert" color="error" :size="mobile ? 40 : 48" />
          </div>
          <h1 class="font-weight-bold mb-1" :class="mobile ? 'text-h5' : 'text-h4'">
            Out of Service
          </h1>
          <p class="text-body-2 text-sm-subtitle-1 text-medium-emphasis mb-0">
            The system is currently unavailable — the subscription needs to be renewed.
          </p>
        </div>

        <!-- Explanation sa problema -->
        <v-card variant="outlined" rounded="lg" class="mb-4 mb-sm-6 w-100">
          <v-card-text :class="mobile ? 'pa-4' : 'pa-6'">
            <p class="text-body-2 text-sm-body-1 mb-4">
              The app is temporarily unavailable because the subscription limit has been reached
              on one of the hosting services:
            </p>

            <div class="d-flex align-start ga-3 mb-3">
              <v-icon icon="mdi-database" color="primary" class="mt-1" />
              <div class="out-of-services-desc">
                <div class="font-weight-bold">Supabase</div>
                <div class="text-body-2 text-medium-emphasis">
                  The database / storage limit on the current plan has been reached and needs to be upgraded or renewed (paid).
                </div>
                <v-btn
                  :href="SUPABASE_BILLING_URL"
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="tonal"
                  color="primary"
                  size="small"
                  class="mt-2 text-none"
                  prepend-icon="mdi-open-in-new"
                >
                  Go to Supabase Billing
                </v-btn>
              </div>
            </div>

            <div class="d-flex align-start ga-3">
              <v-icon icon="mdi-server" color="primary" class="mt-1" />
              <div class="out-of-services-desc">
                <div class="font-weight-bold">Vercel</div>
                <div class="text-body-2 text-medium-emphasis">
                  The hosting / bandwidth limit on the current plan has been reached and needs to be upgraded or renewed (paid).
                </div>
                <v-btn
                  :href="VERCEL_BILLING_URL"
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="tonal"
                  color="primary"
                  size="small"
                  class="mt-2 text-none"
                  prepend-icon="mdi-open-in-new"
                >
                  Go to Vercel Billing
                </v-btn>
              </div>
            </div>

            <v-alert
              type="warning"
              variant="tonal"
              class="mt-4"
              :density="mobile ? 'compact' : 'comfortable'"
            >
              Please contact the person in charge to settle the subscription right away and restore the services.
            </v-alert>
          </v-card-text>
        </v-card>

        <!-- Contact sa Project Manager -->
        <v-card rounded="lg" class="w-100">
          <v-card-text
            class="d-flex align-center"
            :class="mobile ? 'pa-4 ga-3' : 'pa-6 ga-4'"
          >
            <v-avatar color="primary" variant="tonal" :size="mobile ? 44 : 56" class="flex-shrink-0">
              <v-icon icon="mdi-account-tie" :size="mobile ? 24 : 32" />
            </v-avatar>
            <div class="out-of-services-contact">
              <div class="text-caption text-medium-emphasis">PROJECT MANAGER — CONCERNS</div>
              <div class="font-weight-bold" :class="mobile ? 'text-subtitle-1' : 'text-h6'">
                {{ PROJECT_MANAGER }}
              </div>
              <div class="text-body-2 text-medium-emphasis">
                This is the person to contact for billing and subscription concerns.
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-container>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.out-of-services-card {
  /* Fallback para sa browsers nga wala'y 100dvh support */
  height: 100vh;
  height: 100dvh;
  background: rgb(var(--v-theme-surface));
  overflow-y: auto;
}

.out-of-services-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  /* Fluid container sa web-view — walay max-width aron mo-stretch ang content sa tibuok width */
  max-width: none;
}

/* Sa mobile, top-aligned ang content para kanunay makita ang top ug walay cut-off */
@media (max-width: 600px) {
  .out-of-services-body {
    justify-content: flex-start;
    padding-bottom: 2rem;
  }
}

/* Siguraduhon nga ma-display ang FULL text descriptions — walay ellipsis ("...") o truncation */
.out-of-services-desc {
  min-width: 0;
  white-space: normal;
  overflow-wrap: break-word;
}

/* Allow mo-shrink ang contact text sunod sa avatar sa small screens */
.out-of-services-contact {
  min-width: 0;
}
</style>
