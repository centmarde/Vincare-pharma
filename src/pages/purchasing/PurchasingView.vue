<script setup lang="ts">
import InnerLayoutWrapper from "@/layouts/InnerLayoutWrapper.vue";
import HomeLogs from "@/pages/hometab/HomeLogs.vue";
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid class="pa-0">
        <section>
          <v-container fluid class="px-2 px-sm-4 px-md-6">
            <v-row>
              <v-col>
                <div style="min-height: 200px;"></div>
              </v-col>
              <v-col cols="12">
                <v-card>
                  <div class="text-center py-5">Purchasing View Content</div>
                </v-card>
              </v-col>
            </v-row>
          </v-container>
        </section>


      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
