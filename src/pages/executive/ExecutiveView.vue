
<script setup lang="ts">

import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import HomeLogs from '@/pages/hometab/HomeLogs.vue'



</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid class="pa-0">

				executive view

        <!-- Logs Section -->
        <section class="logs-section">
          <v-container fluid class="px-2 px-sm-4 px-md-6">
            <v-row justify="center" align="center" no-gutters>
              <v-col cols="12" sm="12" md="12" lg="12" xl="6">
                <HomeLogs />
              </v-col>
            </v-row>
          </v-container>
        </section>
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>

