<script setup lang="ts">
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid class="pa-0">
        <section>
          <v-container fluid class="px-2 px-sm-4 px-md-6">
            <v-row>
              <v-col>
                <div style="min-height: 50px"></div>
              </v-col>
              <v-col cols="12">
                <v-card>
                  <span class="text-h5 font-weight-bold">Purchase Orders</span>
                </v-card>
              </v-col>
            </v-row>
          </v-container>
        </section>
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
