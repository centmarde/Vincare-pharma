<script setup lang="ts">
import { company } from '@/pages/purchasing/composables/usePODetailModal'
import type { PurchaseOrder } from '@/pages/purchasing/composables/usePODetailModal'
import { formatDatePO_Written } from '@/utils/helpers'
import type { PR } from '@/stores/purchaseRequisitionData'

// Header block: company logo + PO meta (DATE / PR # / PO # / Delivered badge).
defineProps<{
  po: PurchaseOrder | null
  pr: PR | null
  mobile: boolean
}>()
</script>

<template>
  <v-row class="mb-4" align="start">
    <v-col :cols="mobile ? 12 : undefined">
      <div class="d-flex align-center ga-3 mb-2">
        <v-img
          src="/vincare.png"
          :max-width="mobile ? 36 : 48"
          :max-height="mobile ? 36 : 48"
          contain
        />
        <div :class="mobile ? 'text-subtitle-1 font-weight-bold' : 'text-h6 font-weight-bold'">
          {{ company.name }}
        </div>
      </div>
      <div :class="mobile ? 'text-caption text-medium-emphasis' : 'text-body-2 text-medium-emphasis'">
        {{ company.address }}
      </div>
      <div :class="mobile ? 'text-caption text-medium-emphasis' : 'text-body-2 text-medium-emphasis'">
        Butuan City
      </div>
      <div :class="mobile ? 'text-caption text-medium-emphasis' : 'text-body-2 text-medium-emphasis'">
        {{ company.contact }}
      </div>
      <div :class="mobile ? 'text-caption text-medium-emphasis' : 'text-body-2 text-medium-emphasis'">
        {{ company.email }}
      </div>
    </v-col>

    <v-col :cols="mobile ? 12 : undefined" :class="mobile ? 'text-left' : 'text-right'">
      <div :class="mobile ? 'text-subtitle-1 font-weight-bold mb-1' : 'text-h6 font-weight-bold mb-2'">
        PURCHASE ORDER
      </div>
      <div :class="mobile ? 'text-caption' : 'text-body-2'">
        DATE: {{ formatDatePO_Written(po?.created_at ?? '—') }}
      </div>
      <div :class="mobile ? 'text-caption' : 'text-body-2'">
        PR #: {{ pr?.requisition_no ?? '—' }}
      </div>
      <div :class="mobile ? 'text-caption' : 'text-body-2'">
        PO #: <span class="font-weight-bold text-primary">{{ po?.reference_no }}</span>
      </div>
      <div
        v-if="po?.is_delivered"
        :class="mobile ? 'text-caption text-green font-weight-bold' : 'text-body-2 text-green font-weight-bold'"
      >
        <v-icon start size="14">mdi-check-circle</v-icon> Delivered
      </div>
    </v-col>
  </v-row>
</template>
