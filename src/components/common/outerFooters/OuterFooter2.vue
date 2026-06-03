<script lang="ts" setup>
import type { UIConfig } from '@/controller/landingController'
import { computed } from 'vue'

interface Props {
  config?: UIConfig | null
  /** Use a compact/minimal UI (intended for inner layouts). */
  compact?: boolean
}

const props = defineProps<Props>()

const footerConfig = computed(() => props.config?.footer)
const currentYear = computed(() => new Date().getFullYear())

function openLink(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <v-footer
    v-if="config?.showFooter && footerConfig"
    app
    class="text-white"
    :color="footerConfig.color"
    elevation="4"
  >
    <v-container>
      <!-- Compact/minimal footer for inner layouts -->
      <template v-if="compact">
        <v-row align="center" justify="space-between" class="py-2">
          <v-col cols="12" md="5" class="py-1">
            <div class="d-flex align-center justify-center justify-md-start">
              <v-icon :icon="footerConfig.icon" size="small" class="me-2" />
              <span class="text-body-2 font-weight-medium">
                {{ footerConfig.companyName }}
              </span>
            </div>
          </v-col>

          <v-col cols="12" md="4" class="text-center py-1">
            <v-btn
              v-for="social in footerConfig.socialLinks"
              :key="social.platform"
              :aria-label="social.label"
              class="mx-1"
              color="on-primary"
              density="compact"
              icon
              size="small"
              variant="text"
              @click="openLink(social.url)"
            >
              <v-icon :icon="social.icon" size="small" />
            </v-btn>
          </v-col>

          <v-col cols="12" md="3" class="text-md-end text-center py-1">
            <div class="text-caption">{{ currentYear }} © {{ footerConfig.copyright }}</div>
          </v-col>
        </v-row>
      </template>

      <!-- Full footer (landing/external layouts) -->
      <template v-else>
        <!-- Main Footer Content - Two Column Layout -->
        <v-row justify="center" class="text-center">
          <!-- Brand Section -->
          <v-col cols="12" md="6" class="mt-6">
            <div class="mt-6">
              <div class="text-h5 font-weight-bold mb-2">
                <v-avatar
                  :color="footerConfig.companyName ? 'primary' : 'transparent'"
                  size="64"
                  class="mb-3"
                >
                  <v-icon :icon="footerConfig.icon" size="32" color="white" />
                </v-avatar>
                {{ footerConfig.companyName }}
              </div>

              <div class="text-body-1 text-grey-lighten-1 mb-4">
                {{ footerConfig.tagline }}
              </div>
            </div>
          </v-col>

          <!-- Thesis Team Section -->
          <v-col v-if="footerConfig.thesisTeam?.enabled" cols="12" md="6" class="mt-6">
            <div class="mb-6">
              <div class="text-h6 font-weight-bold mb-2">
                {{ footerConfig.thesisTeam.title }}
              </div>
              <div class="text-body-2 text-grey-lighten-1 mb-4">
                {{ footerConfig.thesisTeam.subtitle }}
              </div>

              <v-row justify="center" class="no-gutters">
                <v-col
                  v-for="member in footerConfig.thesisTeam.members"
                  :key="member.name"
                  cols="12"
                  sm="3"
                >
                  <div>
                    <v-avatar :image="member.avatar" size="64" class="mb-3" color="primary">
                      <v-icon v-if="!member.avatar" icon="mdi-account" size="32" />
                    </v-avatar>

                    <v-card-title class="text-body-1 font-weight-bold">
                      {{ member.name }}
                    </v-card-title>

                    <v-card-subtitle class="text-caption text-grey-lighten-1">
                      {{ member.role }}
                    </v-card-subtitle>
                  </div>
                </v-col>
              </v-row>
            </div>
          </v-col>
        </v-row>

        <!-- Social Links and Technologies Section -->
        <v-row justify="center" class="text-center">
          <v-col cols="12" md="8" lg="6">
            <!-- Social Links as Chips -->
            <div class="mb-6">
              <v-chip
                v-for="social in footerConfig.socialLinks"
                :key="social.platform"
                :aria-label="social.label"
                class="ma-1"
                color="primary"
                variant="outlined"
                size="large"
                @click="openLink(social.url)"
              >
                <template #prepend>
                  <v-icon :icon="social.icon" />
                </template>
                {{ social.label }}
              </v-chip>
            </div>

            <!-- Technologies Section with Enhanced Styling -->
            <div class="mb-6">
              <div class="text-body-2 text-grey-lighten-2 mb-3">Powered by</div>

              <v-row justify="center" class="no-gutters">
                <v-col
                  v-for="(tech, index) in footerConfig.technologies"
                  :key="tech.name"
                  cols="auto"
                  class="mx-2"
                >
                  <div class="pa-3 text-center">
                    <v-icon :icon="tech.icon" :color="tech.color" size="24" class="mb-1" />
                    <div class="text-caption font-weight-medium">
                      {{ tech.name }}
                    </div>
                  </div>
                </v-col>
              </v-row>
            </div>
          </v-col>
        </v-row>

        <!-- Bottom Section with Divider -->
        <v-divider class="my-4" color="rgba(255, 255, 255, 0.2)" />

        <v-row justify="center" class="text-center">
          <v-col cols="12">
            <div class="text-caption text-grey-lighten-1">
              {{ currentYear }} © {{ footerConfig.copyright }}
            </div>
          </v-col>
        </v-row>
      </template>
    </v-container>
  </v-footer>
</template>
