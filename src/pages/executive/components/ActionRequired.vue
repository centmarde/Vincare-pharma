<script setup lang="ts">
import { ref, computed } from 'vue'
import ActionRequiredDialog from '../dialogs/ActionRequiredDialog.vue'
import { useChangeRequestsPR } from '@/pages/purchasing/stores/composables/useChangeRequestsPR'
import { formatDatePR_ISO } from '@/utils/helpers'

// CHANGED — was useChangeRequests (finance), now the PR-only composable.
// Every request this list shows is now 'undo_pr' by construction (the
// store only ever issues that type), so the request_type branching that
// used to distinguish 'edit' vs 'undo_pr' styling is no longer needed —
// but it's left in place harmlessly in case a second PR request type is
// added later.
const { requests, loading } = useChangeRequestsPR()
const selected = ref(false)
const selectedReq = ref<any | null>(null)

const count = computed(() => requests.value?.length ?? 0)

function openRequest(req: any) {
  selectedReq.value = req
  selected.value = true
}
</script>

<template>
  <v-card class="rounded-xl" elevation="0">
    <v-card-text class="pa-4 pa-md-6">
      <v-row align="center" class="mb-2" no-gutters>
        <v-col cols="auto" class="mr-2">
          <v-icon icon="mdi-bell-ring-outline" color="error" size="20" />
        </v-col>
        <v-col>
          <span class="text-h6 font-weight-bold">Action Required</span>
        </v-col>
        <v-col v-if="count" cols="auto">
          <v-chip size="small" color="error" variant="flat">{{ count }}</v-chip>
        </v-col>
      </v-row>

      <div v-if="loading" class="pa-6 text-center text-caption text-medium-emphasis">
        <v-progress-circular indeterminate size="20" width="2" class="mb-2" />
        <div>Loading requests…</div>
      </div>

      <v-list v-else-if="requests.length" class="pa-0" lines="two">
        <template v-for="(req, i) in requests" :key="req.id">
          <v-list-item
            class="px-2 py-3 rounded-lg action-item"
            @click="openRequest(req)"
          >
            <template #prepend>
              <v-avatar size="32" rounded="lg" color="error" variant="tonal">
                <v-icon color="error" icon="mdi-cancel" size="18" />
              </v-avatar>
            </template>

            <v-list-item-title class="d-flex align-center ga-2 mb-1">
              <v-chip size="x-small" color="error" variant="tonal" label>Undo</v-chip>
              <span class="text-body-2 font-weight-medium">
                {{ req.from_transaction_no ?? `#${req.transaction_id}` }}
              </span>
              <v-spacer />
              <span class="text-caption text-medium-emphasis flex-shrink-0">
                {{ formatDatePR_ISO(req.created_at) }}
              </span>
            </v-list-item-title>

            <v-list-item-subtitle
              v-if="req.reason"
              class="text-caption text-medium-emphasis"
              style="white-space: normal; line-height: 1.4;"
            >
              <v-icon icon="mdi-comment-text-outline" size="12" class="mr-1" style="opacity: 0.7" />
              {{ req.reason }}
            </v-list-item-subtitle>

            <template #append>
              <v-icon icon="mdi-chevron-right" size="20" color="medium-emphasis" />
            </template>
          </v-list-item>

          <v-divider v-if="i < requests.length - 1" class="my-1" />
        </template>
      </v-list>

      <div v-else class="pa-6 text-center">
        <v-icon icon="mdi-check-circle-outline" size="32" color="success" class="mb-2" />
        <div class="text-caption text-medium-emphasis">No pending change requests.</div>
      </div>

      <ActionRequiredDialog v-model="selected" :request="selectedReq" />
    </v-card-text>
  </v-card>
</template>

<style scoped>
.action-item {
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.action-item:hover {
  background-color: rgba(var(--v-theme-error), 0.05);
}
</style>