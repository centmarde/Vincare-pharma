<script setup lang="ts">
import { useChangeRequestContext } from '../composables/useChangeRequestContext'
import { directionMeta } from '../composables/approvalLabels'
import { formatCurrency, formatDateOnly, formatDatePR_ISO } from '@/utils/helpers'

// A change request, as the approver needs to see it: WHAT the document is
// (amount, who, voucher, account), WHAT changes (now → after), WHO asked and
// WHY, and what approving does. Shared by the desktop and mobile dialogs.
// Before this the dialog showed only the document number and a one-liner.
const props = defineProps<{ request: any }>()

const {
  context, loading, actionLabel, side, docLabel, docNo, requestedBy, changeRows, facts, effect,
  collectionMethodTitle, headline,
} = useChangeRequestContext(() => props.request)

const correction = directionMeta.correction
</script>

<template>
  <div>
    <!-- Who / what / how much -->
    <v-sheet rounded="lg" variant="tonal" color="surface-variant" class="pa-3 mb-4">
      <div class="d-flex align-start ga-3">
        <v-avatar size="36" rounded="lg" :color="correction.color" variant="tonal" class="flex-shrink-0">
          <v-icon :color="correction.color" :icon="correction.icon" size="18" />
        </v-avatar>
        <div class="flex-grow-1" style="min-width: 0">
          <div class="d-flex align-center ga-2 flex-wrap">
            <span class="text-body-2 font-weight-bold">{{ docNo }}</span>
            <v-chip size="x-small" :color="request?.request_type === 'void' ? 'error' : 'blue'" variant="tonal" label>
              {{ actionLabel }}
            </v-chip>
            <v-chip size="x-small" :color="correction.color" variant="flat" label :title="correction.hint">
              {{ correction.label }}
            </v-chip>
            <v-chip
              v-if="side"
              size="x-small"
              variant="tonal"
              label
              :color="directionMeta[side].color"
              :title="directionMeta[side].hint"
            >
              on a {{ side === 'buying' ? 'buying' : 'selling' }} document
            </v-chip>
          </div>
          <div class="text-caption text-medium-emphasis mt-1">
            {{ docLabel.charAt(0).toUpperCase() + docLabel.slice(1) }}
            <template v-if="context?.counterparty"> · {{ context.counterpartyRole ?? 'With' }}: <strong>{{ context.counterparty }}</strong></template>
          </div>
        </div>
        <div v-if="headline" class="text-right flex-shrink-0">
          <div v-if="headline.label" class="text-caption text-medium-emphasis">{{ headline.label }}</div>
          <div class="text-subtitle-1 font-weight-bold text-no-wrap">{{ formatCurrency(headline.amount) }}</div>
        </div>
      </div>

      <v-divider class="my-3" />

      <div class="d-flex ga-6 flex-wrap text-body-2">
        <div>
          <div class="text-caption text-medium-emphasis">Requested by</div>
          <div class="text-high-emphasis">{{ requestedBy }}</div>
        </div>
        <div>
          <div class="text-caption text-medium-emphasis">Requested on</div>
          <div class="text-high-emphasis">{{ formatDatePR_ISO(request?.created_at) }}</div>
        </div>
      </div>
    </v-sheet>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-3" />

    <!-- Why -->
    <div class="mb-4">
      <div class="text-caption font-weight-bold text-medium-emphasis mb-1">REASON FOR REQUEST</div>
      <v-sheet rounded="lg" variant="tonal" color="surface-variant" class="pa-3 text-body-2 border-s-lg border-error">
        {{ request?.reason || '—' }}
      </v-sheet>
    </div>

    <!-- What changes -->
    <div v-if="changeRows.length" class="mb-4">
      <div class="text-caption font-weight-bold text-medium-emphasis mb-2">WHAT WILL CHANGE</div>
      <div class="table-scroll">
        <v-table density="compact" class="rounded-lg border">
          <thead>
            <tr>
              <th class="text-caption">Field</th>
              <th class="text-caption">Now</th>
              <th class="text-caption">After approval</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in changeRows" :key="row.key">
              <td class="text-caption">{{ row.label }}</td>
              <td class="text-caption text-medium-emphasis">{{ row.now }}</td>
              <td class="text-caption font-weight-bold">{{ row.after }}</td>
            </tr>
          </tbody>
        </v-table>
      </div>
    </div>

    <!-- What the document is -->
    <div v-if="facts.length || context?.voucher || context?.collection" class="mb-4">
      <div class="text-caption font-weight-bold text-medium-emphasis mb-2">ABOUT THIS {{ docLabel.toUpperCase() }}</div>
      <v-sheet rounded="lg" border class="pa-3">
        <div class="facts">
          <div v-for="fact in facts" :key="fact.label" class="fact">
            <div class="text-caption text-medium-emphasis">{{ fact.label }}</div>
            <div class="text-body-2 text-high-emphasis">{{ fact.value }}</div>
          </div>
        </div>

        <template v-if="context?.voucher">
          <v-divider class="my-3" />
          <div class="text-caption text-medium-emphasis mb-1">Recorded from voucher</div>
          <div class="text-body-2">
            <strong>{{ context.voucher.dvNo ?? 'Voucher' }}</strong>
            <template v-if="context.voucher.payee"> · {{ context.voucher.payee }}</template>
            · {{ formatCurrency(context.voucher.total) }}
          </div>
          <div v-if="context.voucher.particular" class="text-caption text-medium-emphasis mt-1" style="white-space: pre-line">
            {{ context.voucher.particular }}
          </div>
        </template>

        <template v-if="context?.collection">
          <v-divider class="my-3" />
          <div class="text-caption text-medium-emphasis mb-1">The payment this is about</div>
          <div class="text-body-2">
            <strong>{{ formatCurrency(context.collection.amount) }}</strong>
            <template v-if="collectionMethodTitle"> · {{ collectionMethodTitle }}</template>
            <template v-if="context.collection.referenceNo"> · OR {{ context.collection.referenceNo }}</template>
            <template v-if="context.collection.date"> · {{ formatDateOnly(context.collection.date) }}</template>
            <v-chip v-if="context.collection.voided" size="x-small" color="error" variant="tonal" label class="ml-1">voided</v-chip>
          </div>
          <div v-if="context.collection.chequeNo || context.collection.chequeBank" class="text-caption text-medium-emphasis mt-1">
            Cheque {{ context.collection.chequeNo ?? '' }} {{ context.collection.chequeBank ? `· ${context.collection.chequeBank}` : '' }}
            {{ context.collection.chequeDate ? `· dated ${formatDateOnly(context.collection.chequeDate)}` : '' }}
          </div>
        </template>
      </v-sheet>
    </div>

    <!-- What approving does -->
    <v-alert type="warning" variant="tonal" density="compact" icon="mdi-information-outline" class="mb-4 text-caption">
      <strong>Approving:</strong> {{ effect }}
    </v-alert>
  </div>
</template>

<style scoped>
.facts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 10px 16px;
}
.fact {
  min-width: 0;
  overflow-wrap: anywhere;
}
.table-scroll {
  overflow-x: auto;
}
</style>
