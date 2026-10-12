<script setup lang="ts">
import type { PR } from '@/stores/purchaseRequisitionData'

// Signature section (REQUESTED BY / APPROVED BY).
defineProps<{ mobile: boolean; pr: PR | null }>()
</script>

<template>
  <v-row class="mb-6">
    <v-col :cols="mobile ? 6 : 6" class="d-flex flex-column align-center text-center">
      <div
        :class="
          mobile ? 'text-caption font-weight-bold text-medium-emphasis mb-3' : 'text-caption font-weight-bold text-medium-emphasis mb-6'
        "
      >
        REQUESTED BY:
      </div>
      <div :class="mobile ? 'text-caption font-weight-medium' : 'text-body-2 font-weight-medium'">
        {{ pr?.requester_name }}
      </div>
      <v-divider :style="mobile ? 'width: 120px' : 'width: 200px'" class="mb-1" />
      <div class="text-caption text-medium-emphasis">REQUESTER</div>
    </v-col>
    <v-col :cols="mobile ? 6 : 6" class="d-flex flex-column align-center text-center">
      <div
        :class="
          mobile ? 'text-caption font-weight-bold text-medium-emphasis mb-3' : 'text-caption font-weight-bold text-medium-emphasis mb-6'
        "
      >
        APPROVED BY:
      </div>
      <div :class="mobile ? 'text-caption font-weight-medium' : 'text-body-2 font-weight-medium'">
        {{ pr?.reviewer_name }}
      </div>
      <v-divider :style="mobile ? 'width: 120px' : 'width: 200px'" class="mb-1" />
      <div class="text-caption text-medium-emphasis">APPROVER</div>
    </v-col>
  </v-row>
</template>
