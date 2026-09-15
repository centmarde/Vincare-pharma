<script setup lang="ts">
import { ref } from 'vue'
import { useDisplay } from 'vuetify'
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import ExecutiveWidget from './components/ExecutiveWidget.vue'
import FinanceDashboard from './components/FinanceDashboard.vue'
import PurchaseRequisitionList from './components/PurchaseRequisitionList.vue'

// Responsive: show tab bar on desktop, a dropdown select on small screens.
const { mobile } = useDisplay()

const activeTab = ref<'executive' | 'finance' | 'pr'>('executive')

interface TabOption {
  value: 'executive' | 'finance' | 'pr'
  title: string
  icon: string
}

const tabOptions: TabOption[] = [
  { value: 'executive', title: 'Executive Dashboard', icon: 'mdi-monitor-dashboard' },
  { value: 'finance', title: 'Finance Dashboard', icon: 'mdi-finance' },
  { value: 'pr', title: 'Purchase Requisitions', icon: 'mdi-clipboard-list-outline' },
]
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid class="pa-0">
        <section>
          <v-container fluid class="px-2 px-sm-4 px-md-6">
            <v-row>
              <v-col cols="12">
                <!-- Mobile: dropdown select -->
                <v-select
                  v-if="mobile"
                  v-model="activeTab"
                  :items="tabOptions"
                  item-title="title"
                  item-value="value"
                  density="compact"
                  variant="outlined"
                  color="primary"
                  label="Section"
                  hide-details
                  class="mb-2"
                >
                  <template #selection="{ item }">
                    <v-icon start size="16" class="mr-1">{{ item.raw.icon }}</v-icon>
                    {{ item.title }}
                  </template>
                  <template #item="{ props, item }">
                    <v-list-item v-bind="props" :prepend-icon="item.raw.icon" :title="item.title" />
                  </template>
                </v-select>

                <!-- Desktop: tabs -->
                <v-tabs
                  v-else
                  v-model="activeTab"
                  density="compact"
                  color="primary"
                  class="mb-2"
                  bg-color="transparent"
                  slider-size="4"
                  grow
                >
                  <v-tab
                    v-for="tab in tabOptions"
                    :key="tab.value"
                    :value="tab.value"
                    class="text-none font-weight-bold"
                  >
                    <v-icon start size="16">{{ tab.icon }}</v-icon>
                    {{ tab.title }}
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
