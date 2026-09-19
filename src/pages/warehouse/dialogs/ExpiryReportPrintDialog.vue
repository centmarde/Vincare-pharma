<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ExpiryItem } from '@/stores/expiryReportData'
import type { CategoryRow, Finding, Recommendation } from '@/utils/expiryInsights'
import type { ReportFormat } from '../composables/useExpiryReport'
import { executiveTopItems } from '../composables/useExpiryReport'
import { useExpiryReportPrint } from '../composables/useExpiryReportPrint'
import { companyFor, companyOptions, defaultCompanyFor } from '@/utils/companyProfiles'
import type { CompanyKey } from '@/utils/companyProfiles'
import { formatCurrency } from '@/utils/helpers'

/**
 * The printed Expiring Inventory report, in two formats.
 *
 * Every figure arrives as a prop already computed by `useExpiryReport` — this
 * component formats and lays out, it never calculates. That is deliberate: the
 * screen and the sheet must agree, and a second calculation here is how they
 * would drift.
 */

const props = defineProps<{
  modelValue: boolean
  format: ReportFormat
  monthLabel: string
  asOf: Date
  items: ExpiryItem[]
  totalValue: number
  totalUnits: number
  breakdown: CategoryRow[]
  findings: Finding[]
  recommendations: Recommendation[]
  headlineExpiry: string | null
  daysToExpiry: number | null
  catalogueCount: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const printArea = ref<HTMLElement | null>(null)

const companyKey = ref<CompanyKey>(defaultCompanyFor('expiry_report'))
const company = computed(() => companyFor(companyKey.value))

const isExecutive = computed(() => props.format === 'executive')

/** The executive sheet lists only the top lines; the full report lists everything. */
const tableItems = computed(() =>
  isExecutive.value ? props.items.slice(0, executiveTopItems) : props.items,
)

const untabled = computed(() => props.items.length - tableItems.value.length)

const preparedOn = computed(() =>
  props.asOf.toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' }),
)

const filename = computed(
  () => `Expiring-Inventory-${props.monthLabel.replace(/\s+/g, '-')}-${props.format}.pdf`,
)

const { loading, handlePrint } = useExpiryReportPrint(printArea, filename)

/**
 * Countdown line under the headline. Reads as a deadline when the date is
 * ahead and as a fact when it has passed, rather than a negative day count.
 */
const timingLine = computed(() => {
  const days = props.daysToExpiry
  if (days == null) return ''
  if (days < 0) return `expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`
  if (days === 0) return 'expires today'
  return `approximately ${days} day${days === 1 ? '' : 's'} from today`
})

function money(value: number): string {
  return formatCurrency(value)
}

function shareLabel(share: number): string {
  return `${(share * 100).toFixed(1)}%`
}

</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="900"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-card-title class="pa-4 pa-sm-5 pb-3 d-flex align-center flex-wrap ga-2">
        <span class="text-h6 font-weight-bold">
          {{ isExecutive ? 'Executive Summary' : 'Full Report' }}
        </span>
        <v-spacer />
        <v-select
          v-model="companyKey"
          :items="companyOptions"
          label="Issued by"
          variant="outlined"
          density="compact"
          hide-details
          style="max-width: 240px"
        />
      </v-card-title>
      <v-divider />

      <v-card-text class="pa-4 pa-sm-5 bg-grey-lighten-4">
        <div ref="printArea" class="exp-sheet">
          <!-- Letterhead -->
          <header class="exp-letterhead stmt-avoid-break">
            <div class="exp-company">{{ company.name }}</div>
            <div class="exp-company-line">{{ company.line1 }}</div>
            <div class="exp-company-line">{{ company.line2 }}</div>
            <div v-if="company.license" class="exp-company-line">{{ company.license }}</div>
            <div class="exp-company-line">{{ company.contact }}</div>
          </header>

          <div class="exp-title-row">
            <h1 class="exp-title">Expiring Inventory Report — {{ monthLabel }}</h1>
            <span class="exp-confidential">Confidential</span>
          </div>

          <dl class="exp-meta stmt-avoid-break">
            <div><dt>Prepared</dt><dd>{{ preparedOn }}</dd></div>
            <div>
              <dt>Scope</dt>
              <dd>All catalogue items with an expiry date falling in {{ monthLabel }}</dd>
            </div>
            <div>
              <dt>Valuation basis</dt>
              <dd>Company cost price × on-hand quantity (main warehouse)</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>Live product master, {{ items.length }} of {{ catalogueCount }} SKUs</dd>
            </div>
          </dl>

          <!-- Executive summary -->
          <section class="exp-section stmt-avoid-break">
            <h2 class="exp-h2">Executive Summary</h2>
            <div class="exp-headline">{{ money(totalValue) }}</div>
            <p class="exp-lede">
              of inventory at cost expires
              <template v-if="headlineExpiry">on <strong>{{ headlineExpiry }}</strong></template>
              <template v-if="timingLine"> — {{ timingLine }}</template
              >.
            </p>
            <p class="exp-body">
              Across <strong>{{ items.length }}</strong> SKU{{ items.length === 1 ? '' : 's' }} and
              <strong>{{ totalUnits.toLocaleString() }}</strong> units. This is a write-off exposure
              unless the stock is sold, transferred, or returned to supplier before the expiry date.
            </p>
          </section>

          <!-- Item table -->
          <section class="exp-section">
            <h2 class="exp-h2">
              {{ isExecutive ? `Top ${tableItems.length} by Value` : 'Value at Risk — All Items' }}
            </h2>
            <table class="exp-table">
              <thead>
                <tr>
                  <th class="exp-num">#</th>
                  <th>Product</th>
                  <th>SKU</th>
                  <th class="exp-num">Qty</th>
                  <th class="exp-num">Unit Cost</th>
                  <th class="exp-num">Value at Cost</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, index) in tableItems" :key="item.product_id">
                  <td class="exp-num">{{ index + 1 }}</td>
                  <td>{{ item.product_name }}</td>
                  <td>{{ item.sku || '—' }}</td>
                  <td class="exp-num">{{ item.quantity.toLocaleString() }}</td>
                  <td class="exp-num">{{ money(item.cost_price) }}</td>
                  <td class="exp-num">{{ money(item.value) }}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr v-if="untabled > 0">
                  <td colspan="5" class="exp-muted">
                    {{ untabled }} further SKU{{ untabled === 1 ? '' : 's' }} not listed on this
                    summary
                  </td>
                  <td class="exp-num exp-muted">
                    {{ money(totalValue - tableItems.reduce((s, i) => s + i.value, 0)) }}
                  </td>
                </tr>
                <tr class="exp-total">
                  <td colspan="3">TOTAL</td>
                  <td class="exp-num">{{ totalUnits.toLocaleString() }}</td>
                  <td></td>
                  <td class="exp-num">{{ money(totalValue) }}</td>
                </tr>
              </tfoot>
            </table>
          </section>

          <!-- Category breakdown — full report only -->
          <section v-if="!isExecutive && breakdown.length" class="exp-section stmt-avoid-break">
            <h2 class="exp-h2">Breakdown by Category</h2>
            <table class="exp-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th class="exp-num">Items</th>
                  <th class="exp-num">Value</th>
                  <th class="exp-num">Share</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in breakdown" :key="row.category">
                  <td>{{ row.category }}</td>
                  <td class="exp-num">{{ row.items }}</td>
                  <td class="exp-num">{{ money(row.value) }}</td>
                  <td class="exp-num">{{ shareLabel(row.share) }}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr class="exp-total">
                  <td>Total</td>
                  <td class="exp-num">{{ items.length }}</td>
                  <td class="exp-num">{{ money(totalValue) }}</td>
                  <td class="exp-num">100.0%</td>
                </tr>
              </tfoot>
            </table>
            <p class="exp-footnote">
              Categories are the product master's own classification. Where an item looks misfiled,
              it is flagged below rather than silently regrouped here.
            </p>
          </section>

          <!-- Findings -->
          <section v-if="findings.length" class="exp-section">
            <h2 class="exp-h2">
              {{ isExecutive ? 'Key Findings' : 'Findings & Data Quality Notes' }}
            </h2>
            <div
              v-for="finding in findings"
              :key="finding.id"
              class="exp-finding stmt-avoid-break"
              :class="`exp-finding--${finding.severity}`"
            >
              <div class="exp-finding-title">{{ finding.title }}</div>
              <p class="exp-body">{{ finding.body }}</p>
            </div>
          </section>

          <!-- Recommendations -->
          <section v-if="recommendations.length" class="exp-section stmt-avoid-break">
            <h2 class="exp-h2">Recommended Actions</h2>
            <ol class="exp-actions">
              <li v-for="rec in recommendations" :key="rec.id">{{ rec.text }}</li>
            </ol>
          </section>

          <footer class="exp-footer">
            Valuation at cost, not selling price; realisable loss would differ. Figures as at
            {{ preparedOn }}. Confidential — prepared for internal use; not for circulation outside
            {{ company.name }}.
          </footer>
        </div>
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn variant="text" @click="emit('update:modelValue', false)">Close</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          prepend-icon="mdi-file-pdf-box"
          :loading="loading"
          @click="handlePrint"
        >
          Download PDF
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped src="../css/expiry-report.css"></style>

