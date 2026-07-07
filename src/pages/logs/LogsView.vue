<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import LogsWidget from '@/pages/logs/components/LogsWidget.vue'
import LogsCard from '@/pages/logs/components/LogsCard.vue'
import LogsInAllUsers from '@/pages/logs/components/LogsInAllUsers.vue'
import { useLogsDataStore } from '@/stores/logsData'

const logsStore = useLogsDataStore()
const { logs } = storeToRefs(logsStore)

const moduleFilter = ref<string | null>(null)
const activeTab = ref<'activity' | 'users'>('activity')

// Compute module counts from all logs (one per transaction_id)
const totalCount = computed(() => {
  // Deduplicate by transaction_id
  const latestByTransaction = new Map<number, any>()
  logs.value.forEach((log) => {
    const txId = log.transaction_id
    if (txId) {
      const existing = latestByTransaction.get(txId)
      if (!existing || log.id > existing.id) {
        latestByTransaction.set(txId, log)
      }
    }
  })
  return latestByTransaction.size
})

const moduleCounts = computed(() => {
  // Deduplicate by transaction_id, then count by module
  const latestByTransaction = new Map<number, any>()
  logs.value.forEach((log) => {
    const txId = log.transaction_id
    if (txId) {
      const existing = latestByTransaction.get(txId)
      if (!existing || log.id > existing.id) {
        latestByTransaction.set(txId, log)
      }
    }
  })

  const counts: Record<string, number> = {}
  latestByTransaction.forEach((log) => {
    const mod = log.module
    if (mod) {
      counts[mod] = (counts[mod] || 0) + 1
    }
  })
  return counts
})

onMounted(async () => {
  await logsStore.fetchLogs()
})
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid class="pa-0">
        <section>
          <v-container fluid class="px-2 px-sm-4 px-md-6">
            <v-row>

              <v-col cols="12">
                <LogsCard
                  v-model:active-filter="moduleFilter"
                  :module-counts="moduleCounts"
                  :total-count="totalCount"
                />
              </v-col>
							<v-col cols="12" sm="5">
                <v-tabs
                  v-model="activeTab"
                  density="compact"
                  color="primary"
                  class="mb-2"
                  bg-color="transparent"
                  slider-size="4"
                  grow
                >
                  <v-tab value="activity" class="text-none font-weight-bold">
                    Transaction Activity Logs
                  </v-tab>
                  <v-tab value="users" class="text-none font-weight-bold">
                    Users Activity Logs
                  </v-tab>
                </v-tabs>
              </v-col>
              <v-col cols="12" v-if="activeTab === 'activity'">
                <LogsWidget :module-filter="moduleFilter" />
              </v-col>
              <v-col cols="12" v-else-if="activeTab === 'users'">
                <LogsInAllUsers />
              </v-col>
            </v-row>
          </v-container>
        </section>
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>

<style scoped>

</style>
