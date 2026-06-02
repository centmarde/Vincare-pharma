<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import SettingsWidget from './components/SettingsWidget.vue'
</script>

<template>
  <inner-layout-wrapper>
    <template #content>
      <v-container fluid class="pa-6">
        <v-row>
          <v-col cols="12">
            <!-- Page Header -->
            <div class="d-flex align-center mb-6">
              <v-icon icon="mdi-cog-outline" class="mr-3" size="large" color="primary"></v-icon>
              <div>
                <h1 class="text-h4 font-weight-bold">Account Settings</h1>
                <p class="text-subtitle-1 text-medium-emphasis ma-0">
                  Manage your personal information and security settings
                </p>
              </div>
            </div>
          </v-col>
        </v-row>

        <v-row>
          <v-col cols="12">
            <!-- Settings Widget for Profile and Password -->
            <SettingsWidget />
          </v-col>
        </v-row>
      </v-container>
    </template>
  </inner-layout-wrapper>
</template>
