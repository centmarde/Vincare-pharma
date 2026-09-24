<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { formatCurrency, formatMonthYear, formatDatePR_ISO } from '@/utils/helpers'
import type { DisposalRequest } from '@/stores/disposalsData'

const props = defineProps<{
  disposals: DisposalRequest[]
}>()

const page = ref(1)
const perPage = 8

const totalPages = computed(() => Math.max(1, Math.ceil(props.disposals.length / perPage)))

const paginatedDisposals = computed(() => {
  const start = (page.value - 1) * perPage
  return props.disposals.slice(start, start + perPage)
})

watch(
  () => props.disposals.length,
  () => {
    page.value = 1
  },
)
</script>

<template>
  <div>
    <v-card
      v-for="disposal in paginatedDisposals"
      :key="disposal.id"
      variant="outlined"
      rounded="lg"
      class="mb-4"
    >
      <v-card-text class="pa-4">
        <div class="d-flex align-center justify-space-between ga-2 mb-2">
          <v-chip size="small" color="error" variant="tonal" label>
            {{ disposal.reference_no ?? `#${disposal.id}` }}
          </v-chip>
          <span class="text-caption text-medium-emphasis">
            {{ formatDatePR_ISO(disposal.updated_at ?? disposal.created_at) }}
          </span>
        </div>

        <div class="text-body-1 font-weight-medium">
          {{ disposal.product?.product_name ?? '—' }}
        </div>
        <div class="text-caption text-medium-emphasis mb-4">
          SKU {{ disposal.product?.sku || 'N/A' }} · Batch
          {{ disposal.product?.batch_no || '—' }}
        </div>

        <v-divider class="mb-4" />

        <v-row dense class="mb-2">
          <v-col cols="4">
            <div class="text-caption text-medium-emphasis">Qty</div>
            <div class="text-body-2 font-weight-medium">{{ disposal.qty }}</div>
          </v-col>
          <v-col cols="4">
            <div class="text-caption text-medium-emphasis">Expiry</div>
            <div class="text-body-2">
              {{
                disposal.product?.expiry_date
                  ? formatMonthYear(disposal.product.expiry_date)
                  : 'N/A'
              }}
            </div>
          </v-col>
          <v-col cols="4" class="text-right">
            <div class="text-caption text-medium-emphasis">Value at cost</div>
            <div class="text-body-2 font-weight-medium text-error">
              {{ formatCurrency(disposal.total_cost) }}
            </div>
          </v-col>
        </v-row>

        <v-sheet
          v-if="disposal.reason"
          rounded="lg"
          color="surface-variant"
          class="pa-2 mb-4 text-caption"
        >
          <v-icon icon="mdi-comment-text-outline" size="14" class="mr-1" />
          {{ disposal.reason }}
        </v-sheet>

        <v-divider class="mb-2" />

        <div class="d-flex align-center justify-space-between ga-2">
          <div>
            <div class="text-caption text-medium-emphasis">Requested by</div>
            <div class="text-caption">{{ disposal.requester_name }}</div>
          </div>
          <div class="text-right">
            <div class="text-caption text-medium-emphasis">Approved by</div>
            <div class="text-caption">{{ disposal.approver_name ?? '—' }}</div>
          </div>
        </div>
      </v-card-text>
    </v-card>

    <v-pagination
      v-if="totalPages > 1"
      v-model="page"
      :length="totalPages"
      :total-visible="4"
      density="compact"
      size="small"
      class="mt-2"
    />
  </div>
</template>
