<script setup lang="ts">
import { useTermsDecision } from '../composables/useTermsDecision'
import { formatCurrency, formatDatePR_ISO, formatExpiryMonthYear } from '@/utils/helpers'

// Everything an executive needs to approve or reject a terms request — lock an
// order's terms (In-House Agree / Ethical Invoice) or undo them. Shared by the
// desktop and mobile Action Required dialogs.
const props = defineProps<{ request: any }>()

const {
  details, loading, isUnlock, isEthical, lines,
  grossTotal, costTotal, missingCostLines, belowCostLines, keptRevenue,
  ratioLabel, ratioClass, profitLabel, marginLabel, prComparison,
  lineMargin, qtyLabel, effect,
} = useTermsDecision(() => props.request)

function orderLabel(): string {
  const r = props.request
  return details.value?.order_no ?? r?.order_no
    ?? (r?.order_type === 'ethical_order' ? `Draft #${r?.transaction_id}` : `Order #${r?.transaction_id}`)
}
</script>

<template>
  <div>
    <!-- Who, what, and why -->
    <v-sheet rounded="lg" variant="tonal" color="surface-variant" class="pa-3 mb-4">
      <div class="d-flex align-center ga-3">
        <v-avatar size="36" rounded="lg" :color="isUnlock ? 'error' : 'indigo'" variant="tonal" class="flex-shrink-0">
          <v-icon :color="isUnlock ? 'error' : 'indigo'" :icon="isUnlock ? 'mdi-lock-open-variant-outline' : 'mdi-handshake-outline'" size="18" />
        </v-avatar>
        <div class="flex-grow-1" style="min-width: 0">
          <div class="d-flex align-center ga-2 flex-wrap">
            <span class="text-body-2 font-weight-bold">{{ orderLabel() }}</span>
            <v-chip size="x-small" :color="isUnlock ? 'error' : 'indigo'" variant="tonal" label>
              {{ isUnlock ? 'Unapprove terms' : 'Lock terms' }}
            </v-chip>
            <v-chip size="x-small" variant="tonal" color="green" label>
              {{ request?.order_type === 'ethical_order' ? 'Ethical' : 'In-House' }}
            </v-chip>
          </div>
          <div class="text-caption text-medium-emphasis mt-1">
            {{ details?.customer?.name ?? request?.customer_name ?? 'Customer not recorded' }}
            <template v-if="details?.customer?.agency_type"> · {{ details.customer.agency_type }}</template>
            <template v-if="details?.customer?.area"> · {{ details.customer.area }}</template>
          </div>
        </div>
      </div>
      <v-divider class="my-3" />
      <div class="d-flex ga-6 flex-wrap text-body-2 text-high-emphasis">
        <div>
          <div class="text-caption text-medium-emphasis">Requested</div>
          <div>{{ formatDatePR_ISO(request?.created_at) }}<template v-if="details?.requested_by"> · {{ details.requested_by }}</template></div>
        </div>
        <div v-if="details?.order_date">
          <div class="text-caption text-medium-emphasis">Order date</div>
          <div>{{ formatDatePR_ISO(details.order_date) }}</div>
        </div>
        <div v-if="request?.reason">
          <div class="text-caption text-medium-emphasis">Reason</div>
          <div>{{ request.reason }}</div>
        </div>
      </div>
    </v-sheet>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

    <template v-if="details">
      <!-- The figures the decision turns on -->
      <div class="text-caption font-weight-bold text-medium-emphasis mb-2">THE DEAL</div>
      <div class="figures mb-3">
        <template v-if="isEthical">
          <div class="figure"><div class="figure-label">Gross</div><div class="figure-value">{{ formatCurrency(grossTotal) }}</div></div>
          <div class="figure"><div class="figure-label">Discount</div><div class="figure-value">−{{ formatCurrency(details.discount) }}</div></div>
          <div class="figure"><div class="figure-label">Invoice total</div><div class="figure-value font-weight-bold">{{ formatCurrency(details.total) }}</div></div>
          <div class="figure"><div class="figure-label">Rebate + ads (paid out)</div><div class="figure-value">−{{ formatCurrency(details.rebate + details.ads) }}</div></div>
          <div class="figure"><div class="figure-label">Kept after rebate &amp; ads</div><div class="figure-value">{{ formatCurrency(keptRevenue) }}</div></div>
        </template>
        <template v-else>
          <div class="figure"><div class="figure-label">Offer total</div><div class="figure-value font-weight-bold">{{ formatCurrency(details.total) }}</div></div>
          <div class="figure">
            <div class="figure-label">Government PR</div>
            <div class="figure-value">{{ details.govt_pr_amount != null ? formatCurrency(details.govt_pr_amount) : '—' }}</div>
            <div v-if="details.govt_pr_no" class="figure-note">PR # {{ details.govt_pr_no }}</div>
            <div v-if="prComparison" class="figure-note" :class="prComparison.over ? 'text-error font-weight-bold' : ''">{{ prComparison.label }}</div>
          </div>
        </template>
        <div class="figure"><div class="figure-label">Company cost</div><div class="figure-value">{{ formatCurrency(costTotal) }}</div></div>
        <div class="figure">
          <div class="figure-label">Ratio (cost / {{ isEthical ? 'kept' : 'offer' }})</div>
          <div class="figure-value font-weight-bold" :class="ratioClass">{{ ratioLabel }}</div>
        </div>
        <div class="figure">
          <div class="figure-label">Projected profit</div>
          <div class="figure-value font-weight-bold" :class="ratioClass">{{ profitLabel }}</div>
          <div class="figure-note">margin {{ marginLabel }}</div>
        </div>
        <div v-if="isEthical" class="figure">
          <div class="figure-label">Terms · Agent</div>
          <div class="figure-value">{{ details.terms_days != null ? `Net ${details.terms_days} days` : '—' }}</div>
          <div class="figure-note">{{ details.agent_name ?? 'No agent' }}</div>
        </div>
        <div v-else class="figure">
          <div class="figure-label">Negotiation</div>
          <div class="figure-value">{{ details.negotiation_rounds }} round(s)</div>
          <div v-if="details.po_no" class="figure-note">PO {{ details.po_no }}</div>
        </div>
      </div>

      <!-- Things that should give an approver pause -->
      <v-alert v-if="belowCostLines" type="error" variant="tonal" density="compact" class="mb-2 text-caption">
        {{ belowCostLines }} line(s) are priced below company cost.
      </v-alert>
      <v-alert v-if="missingCostLines" type="warning" variant="tonal" density="compact" class="mb-2 text-caption">
        {{ missingCostLines }} of {{ lines.length }} line(s) have no recorded cost, so the cost, ratio and profit above are understated.
      </v-alert>
      <template v-if="!isUnlock">
        <v-alert v-if="details.short_lines === null" type="warning" variant="tonal" density="compact" class="mb-2 text-caption">
          Could not check stock right now.
        </v-alert>
        <v-alert v-else-if="details.short_lines.length" type="warning" variant="tonal" density="compact" class="mb-2 text-caption">
          <div class="font-weight-bold mb-1">Stock is short today on {{ details.short_lines.length }} product(s):</div>
          <div v-for="(s, i) in details.short_lines" :key="i">
            {{ s.product_name }} — needs {{ s.needed }}, {{ s.available }} {{ s.expired ? 'usable (batch expired)' : 'available' }}
          </div>
          <div v-if="!isEthical" class="mt-1">Approving still locks the terms; the order waits for stock and its PO is issued once stock arrives.</div>
        </v-alert>
        <div v-else class="text-caption text-green-darken-1 mb-2">
          <v-icon icon="mdi-check-circle-outline" size="14" class="mr-1" />Stock is sufficient today for every line.
        </div>
      </template>

      <!-- The lines -->
      <div class="text-caption font-weight-bold text-medium-emphasis mt-3 mb-2">LINES</div>
      <div class="table-scroll mb-3">
        <v-table density="compact" class="rounded-lg border">
          <thead>
            <tr>
              <th class="text-caption">Product</th>
              <th class="text-caption text-right">Qty</th>
              <th class="text-caption text-right">Unit price</th>
              <th class="text-caption text-right">Cost / unit</th>
              <th class="text-caption text-right">Line total</th>
              <th class="text-caption text-right">Margin</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(line, i) in lines" :key="i" :class="{ 'below-cost': line.cost_unit != null && line.cost_unit > line.unit_price }">
              <td class="text-caption">
                <div>{{ line.product_name }}</div>
                <div v-if="line.batch_no || line.expiry_date" class="text-medium-emphasis">
                  <template v-if="line.batch_no">Batch {{ line.batch_no }}</template><template v-if="line.batch_no && line.expiry_date"> · </template><template v-if="line.expiry_date">Exp {{ formatExpiryMonthYear(line.expiry_date) }}</template>
                </div>
              </td>
              <td class="text-caption text-right text-no-wrap">{{ qtyLabel(line) }}</td>
              <td class="text-caption text-right">{{ formatCurrency(line.unit_price) }}</td>
              <td class="text-caption text-right">{{ line.cost_unit != null ? formatCurrency(line.cost_unit) : '—' }}</td>
              <td class="text-caption text-right">{{ formatCurrency(line.line_total) }}</td>
              <td class="text-caption text-right">{{ lineMargin(line) }}</td>
            </tr>
          </tbody>
        </v-table>
      </div>

      <!-- What staff wrote -->
      <div v-if="details.remarks || details.last_round" class="mb-3 text-body-2">
        <div v-if="details.remarks"><span class="text-caption text-medium-emphasis">Order notes:</span> {{ details.remarks }}</div>
        <div v-if="details.last_round"><span class="text-caption text-medium-emphasis">Last negotiation round:</span> {{ details.last_round }}</div>
      </div>
    </template>

    <v-alert
      :type="isUnlock ? 'warning' : 'info'"
      variant="tonal"
      density="compact"
      icon="mdi-information-outline"
      class="mb-4 text-caption"
    >
      {{ effect }}
    </v-alert>
  </div>
</template>

<style scoped>
.figures {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
}
.figure {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
  padding: 8px 10px;
}
.figure-label {
  font-size: 0.7rem;
  opacity: 0.7;
}
.figure-value {
  font-size: 0.95rem;
  font-variant-numeric: tabular-nums;
}
.figure-note {
  font-size: 0.7rem;
  opacity: 0.8;
}
.table-scroll {
  overflow-x: auto;
}
.below-cost td {
  background: rgba(var(--v-theme-error), 0.08);
}
</style>
