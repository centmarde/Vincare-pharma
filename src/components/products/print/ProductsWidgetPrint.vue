<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import html2pdf from 'html2pdf.js'
import { useToast } from 'vue-toastification'
import { companyFor, companyOptions, defaultCompanyFor } from '@/utils/companyProfiles'
import type { CompanyKey } from '@/utils/companyProfiles'
import { formatCurrency, formatMonthYear, isBlank } from '@/utils/helpers'
import type { ProductType } from '@/stores/productsData'

/**
 * Printable Products report.
 *
 * Ang tanang datos moabot na as props (ang filtered rows + filter context) —
 * kini nga component nag-format ug nag-layout lang, mao nga ang screen ug ang
 * PDF dili mag-drift. Landscape A4 kay ang table mo-require og ~10 ka columns.
 */
const props = defineProps<{
  modelValue: boolean
  items: ProductType[]
  typeFilter: string
  searchQuery: string
  expiryLabel: string | null
  warehouseName: string | null
  canViewSupplier: boolean
  showWarehouseQty: boolean
  getStock: (item: ProductType) => number
  getReservations: (item: ProductType) => { customer_name: string; reserved_qty: number }[]
  getWarehouseQty: (item: ProductType) => number | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const toast = useToast()
const printArea = ref<HTMLElement | null>(null)
const loading = ref(false)

// Internal management report, in the same vein as the expiry report: issued by
// the operating entity that holds the warehouse.
const companyKey = ref<CompanyKey>(defaultCompanyFor('expiry_report'))
const company = computed(() => companyFor(companyKey.value))

const preparedOn = computed(() =>
  new Date().toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' }),
)

const filename = computed(() => {
  // I-apil ang filter type sa filename kung naay active nga type filter;
  // kung 'All' (walay filter), dili na i-apil.
  const tag =
    props.typeFilter !== 'All' ? `-${props.typeFilter.toLowerCase().replace(/\s+/g, '-')}` : ''
  return `Products${tag}-${new Date().toISOString().slice(0, 10)}.pdf`
})

const hasFilters = computed(
  () =>
    props.typeFilter !== 'All' ||
    !!props.searchQuery ||
    !!props.expiryLabel ||
    !!props.warehouseName,
)

const totalStock = computed(() => props.items.reduce((sum, item) => sum + props.getStock(item), 0))

// Total nga columns para sa footer/empty spacing: 12 ka base columns plus ang
// optional Warehouse Total Qty ug Supplier.
const columnCount = computed(
  () => 12 + (props.showWarehouseQty ? 1 : 0) + (props.canViewSupplier ? 1 : 0),
)

function stockOf(item: ProductType): number {
  return props.getStock(item)
}

// Expanded-row detail: reservations nga gi-format ngadto sa usa ka cell.
function reservedText(item: ProductType): string {
  const list = props.getReservations(item)
  return list.length ? list.map((r) => `${r.customer_name} (${r.reserved_qty})`).join('; ') : '—'
}

function warehouseQty(item: ProductType): string {
  const q = props.getWarehouseQty(item)
  return q == null ? '—' : String(Math.max(0, q))
}

async function handlePrint() {
  await nextTick()
  const el = printArea.value
  if (!el) return

  loading.value = true
  // html2canvas renders computed colours literally, so a dark-theme page would
  // print white-on-white. Huga ang tanang text pina-ug black before rasterise.
  el.querySelectorAll('div, td, th, span, p, table').forEach((child) => {
    ;(child as HTMLElement).style.color = '#000000'
  })

  try {
    await html2pdf()
      .set({
        margin: 10,
        filename: filename.value,
        image: { type: 'jpeg', quality: 0.98 },
        // windowWidth pinned to what the element actually needs, so the wide
        // product table renders whole and is scaled to the page instead of
        // being cut off at the viewport.
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          windowWidth: Math.max(el.scrollWidth, el.offsetWidth),
        },
        // Landscape: ang product table mo-sulod sa ~10 ka columns. Portrait
        // would cram them into ~14mm each.
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
      })
      .from(el)
      .save()
    toast.success('Products report generated.')
  } catch {
    toast.error('Could not generate the products report.')
  } finally {
    loading.value = false
  }
}
</script>
<template>
  <v-dialog
    :model-value="modelValue"
    max-width="1080"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-card-title class="pa-4 pa-sm-5 pb-3 d-flex align-center flex-wrap ga-2">
        <span class="text-h6 font-weight-bold">Products Report</span>
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
        <v-btn variant="text" class="text-none" @click="emit('update:modelValue', false)">
          Close
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          class="text-none"
          prepend-icon="mdi-file-pdf-box"
          :loading="loading"
          :disabled="!items.length"
          @click="handlePrint"
        >
          Download PDF
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-4 pa-sm-5" style="background: #ffffff">
        <div ref="printArea" class="pp-report">
          <div class="pp-header">
            <div class="pp-company">{{ company.name }}</div>
            <div class="pp-address">{{ company.line1 }}</div>
            <div class="pp-address">{{ company.line2 }}</div>
            <div class="pp-title">PRODUCTS LIST</div>
            <div class="pp-meta">
              Prepared {{ preparedOn }} &middot; {{ items.length }} product{{
                items.length === 1 ? '' : 's'
              }}
            </div>
            <div v-if="hasFilters" class="pp-filters">
              <span v-if="typeFilter !== 'All'">Type: {{ typeFilter }}</span>
              <span v-if="searchQuery">Search: "{{ searchQuery }}"</span>
              <span v-if="expiryLabel">Expiring as of: {{ expiryLabel }}</span>
              <span v-if="warehouseName">Warehouse: {{ warehouseName }}</span>
            </div>
            <div v-else class="pp-filters">All products</div>
          </div>

          <table class="pp-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Product Name</th>
                <th>Brand</th>
                <th>SKU</th>
                <th class="pp-num">Stock</th>
                <th class="pp-num">Selling Price</th>
                <th>Unit</th>
                <th>Batch No.</th>
                <th>Expiry Date</th>
                <th>Barcode</th>
                <th>Status</th>
                <th>Reserved</th>
                <th v-if="showWarehouseQty">Warehouse Total Qty</th>
                <th v-if="canViewSupplier">Supplier</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in items" :key="item.id">
                <td>{{ item.category || 'N/A' }}</td>
                <td>{{ item.product_name || 'N/A' }}</td>
                <td>{{ isBlank(item.brand) ? 'No brand' : item.brand }}</td>
                <td>{{ item.sku || 'N/A' }}</td>
                <td class="pp-num">{{ stockOf(item) }}</td>
                <td class="pp-num">
                  {{ isBlank(item.selling_price) ? '—' : formatCurrency(Number(item.selling_price)) }}
                </td>
                <td>{{ item.unit || 'N/A' }}</td>
                <td>{{ item.batch_no || 'N/A' }}</td>
                <td>{{ item.expiry_date ? formatMonthYear(item.expiry_date) : '—' }}</td>
                <!-- Expanded-row details isip columns: Barcode, Status, Reservations -->
                <td>{{ item.barcode || 'N/A' }}</td>
                <td>{{ item.status || 'N/A' }}</td>
                <td>{{ reservedText(item) }}</td>
                <td v-if="showWarehouseQty">{{ warehouseQty(item) }}</td>
                <td v-if="canViewSupplier">{{ item.suppliers?.name || 'N/A' }}</td>
              </tr>
              <tr v-if="!items.length">
                <td :colspan="columnCount" class="text-center pp-empty">
                  No products match the current filters.
                </td>
              </tr>
            </tbody>
            <tfoot v-if="items.length">
              <tr class="pp-total">
                <td colspan="4">Total</td>
                <td class="pp-num">{{ totalStock }}</td>
                <td :colspan="columnCount - 5"></td>
              </tr>
            </tfoot>
          </table>

          <footer class="pp-footer">
            {{ items.length }} product{{ items.length === 1 ? '' : 's' }} as at {{ preparedOn }}.
            Confidential &mdash; for internal use only. Do not distribute without authorisation.
          </footer>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* Ang preview mao ang printed page — pirmi white, dili mo-inherit sa app theme. */
.pp-report {
  background: #ffffff;
  color: #000000;
  font-size: 0.8rem;
}
.pp-header {
  text-align: center;
  margin-bottom: 0.75rem;
}
.pp-company {
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 2px;
}
.pp-address {
  font-size: 0.65rem;
  color: #555555;
}
.pp-title {
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 2px;
  margin-top: 2px;
}
.pp-meta {
  font-size: 0.65rem;
  color: #555555;
  margin-top: 2px;
}
.pp-filters {
  font-size: 0.7rem;
  color: #333333;
  margin-top: 4px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 2px 14px;
}
.pp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.72rem;
}
.pp-table th,
.pp-table td {
  border-bottom: 1px solid #cccccc;
  padding: 4px 6px;
  text-align: left;
  vertical-align: top;
}
.pp-table th {
  border-bottom: 2px solid #000000;
  font-weight: 700;
}
/* Para ang usa ka product row dili ma-split sa duha ka PDF pages. */
.pp-table tbody tr {
  break-inside: avoid;
}
.pp-num {
  text-align: right;
  white-space: nowrap;
}
.pp-empty {
  padding-top: 1rem;
  padding-bottom: 1rem;
}
.pp-total td {
  border-top: 2px solid #000000;
  font-weight: 700;
}
.pp-footer {
  margin-top: 1rem;
  padding-top: 0.4rem;
  border-top: 1px solid #999999;
  font-size: 0.6rem;
  line-height: 1.6;
  text-align: center;
  color: #555555;
}
</style>


