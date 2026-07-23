<script setup lang="ts">
import { ref } from 'vue'
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import ExecutiveWidget from './components/ExecutiveWidget.vue'
import FinanceDashboard from './components/FinanceDashboard.vue'
import PurchaseRequisitionList from './components/PurchaseRequisitionList.vue'

const activeTab = ref<'executive' | 'finance' | 'pr'>('executive')
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid class="pa-0">
        <section>
          <v-container fluid class="px-2 px-sm-4 px-md-6">
            <v-row>
              <v-col cols="12" sm="6">
                <v-tabs
                  v-model="activeTab"
                  density="compact"
                  color="primary"
                  class="mb-2"
                  bg-color="transparent"
                  slider-size="4"
                  grow
                >
                  <v-tab value="executive" class="text-none font-weight-bold">
                    <v-icon start size="16">mdi-monitor-dashboard</v-icon>
                    Executive Dashboard
                  </v-tab>
                  <v-tab value="finance" class="text-none font-weight-bold">
                    <v-icon start size="16">mdi-finance</v-icon>
                    Finance Dashboard
                  </v-tab>
                  <v-tab value="pr" class="text-none font-weight-bold">
                    <v-icon start size="16">mdi-clipboard-list-outline</v-icon>
                    Purchase Requisitions
                  </v-tab>
                </v-tabs>
              </v-col>
            </v-row>

            <!-- Tab Content -->
            <v-row>
              <v-col cols="12">
                <ExecutiveWidget v-if="activeTab === 'executive'" />
                <FinanceDashboard v-else-if="activeTab === 'finance'" />
                <PurchaseRequisitionList v-else />
              </v-col>
            </v-row>
          </v-container>
        </section>
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>

<style scoped></style>
