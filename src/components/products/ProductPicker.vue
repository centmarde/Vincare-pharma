<script setup lang="ts">
import type { ProductPickerResult } from '@/stores/productsData'
import { useProductsDataStore } from '@/stores/productsData'
import { formatCurrency, formatMonthYear } from '@/utils/helpers'
import { govtShelfLife, QUALIFICATION_MONTHS } from '@/utils/qualification'
import { storeToRefs } from 'pinia'
import { computed, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    /**
     * Show the company cost alongside the selling price.
     *
     * OFF by default, and deliberately opt-in rather than opt-out: this picker
     * is shared by Purchasing (who need cost to buy) and by every selling
     * channel (who must not see it — the same rule that keeps supplier pricing
     * out of In-House/Ethical). A new caller that forgets the prop leaks
     * nothing; one that forgot to disable it would.
     */
    showCost?: boolean
    /**
     * `name`  — pick a PRODUCT NAME. Each name shows one row, and selecting it
     *           returns that name's first-expiring batch. Purchasing wants this:
     *           a PR mints a NEW batch row and collects its own expiry, so an
     *           existing batch's dates are noise at best, misleading at worst.
     * `batch` — pick a SPECIFIC BATCH. Batch no., expiry and on-hand are shown,
     *           and a name holding several batches expands so the user chooses
     *           which. Everywhere stock is SOLD from wants this.
     */
    mode?: 'name' | 'batch'
    /**
     * Which location `stock` is counted at: `null` = main warehouse, an id =
     * that branch. Must match where the order will actually draw from — main
     * and branch stock are different numbers for the same batch.
     */
    locationId?: number | null
    /**
     * Apply the government shelf-life bar (In-House). Batches with under
     * QUALIFICATION_MONTHS left are marked as needing executive approval rather
     * than hidden: the stock is physically on the shelf, and hiding it reads as
     * "out of stock" and sends staff hunting for something that is right there.
     */
    requireShelfLife?: boolean
  }>(),
  { showCost: false, mode: 'name', locationId: null, requireShelfLife: false },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'select', product: ProductPickerResult): void
}>()

const productsStore = useProductsDataStore()
const { pickerProducts: products, loading, pickerTotalCount } = storeToRefs(productsStore)

const searchInput = ref('')

const PAGE_SIZE = 15
const LOAD_MORE_STEP = 10
const currentLimit = ref(PAGE_SIZE)
const loadingMore = ref(false)

const hasMore = ref(true)

/** Names the user has expanded to see the individual batches of. */
const expandedNames = ref<Set<string>>(new Set())

// `clearable` sets the field to null, not ''.
const term = () => searchInput.value ?? ''

/**
 * Batch rows folded into one entry per product name.
 *
 * The RPC returns rows already ordered by name then expiry (FEFO), so grouping
 * in arrival order preserves that: `head` is always the first-expiring batch.
 */
type NameGroup = {
  name: string
  head: ProductPickerResult
  batches: ProductPickerResult[]
  totalStock: number
}

const groups = computed<NameGroup[]>(() => {
  const out: NameGroup[] = []
  const byName = new Map<string, NameGroup>()
  for (const row of products.value) {
    const name = row.product_name ?? ''
    let group = byName.get(name)
    if (!group) {
      group = { name, head: row, batches: [], totalStock: 0 }
      byName.set(name, group)
      out.push(group)
    }
    group.batches.push(row)
    group.totalStock += Number(row.stock ?? 0)
  }
  return out
})

function runSearch() {
  currentLimit.value = PAGE_SIZE
  expandedNames.value = new Set()
  productsStore
    .fetchProductPicker({ search: term(), limit: currentLimit.value, locationId: props.locationId })
    .then(() => {
      // Counted in NAMES, not rows: the RPC pages by distinct product_name and
      // returns every batch of the names on that page, so rows routinely
      // outnumber pickerTotalCount and comparing rows would hide "See more".
      hasMore.value = groups.value.length < pickerTotalCount.value
    })
}

// Suggestions update as the user types. Debounced so a word doesn't fire one
// request per letter; Enter still searches immediately.
const SEARCH_DEBOUNCE_MS = 250
let debounce: ReturnType<typeof setTimeout> | undefined

function queueSearch() {
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(runSearch, SEARCH_DEBOUNCE_MS)
}

function searchNow() {
  if (debounce) clearTimeout(debounce)
  runSearch()
}

watch(searchInput, queueSearch)
onUnmounted(() => { if (debounce) clearTimeout(debounce) })

async function loadMore() {
  loadingMore.value = true
  currentLimit.value += LOAD_MORE_STEP
  try {
    await productsStore.fetchProductPicker({
      search: term(),
      limit: currentLimit.value,
      locationId: props.locationId,
    })
    hasMore.value = groups.value.length < pickerTotalCount.value
  } finally {
    loadingMore.value = false
  }
}

/** '2027-10-01' -> 'Oct 2027'. An undated batch says so rather than render blank. */
function expiryLabel(value: string | null): string {
  if (!value) return 'No expiry'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? 'No expiry' : formatMonthYear(d)
}

function stockLabel(stock: number | null): string {
  if (stock == null) return 'Stock unknown'
  return `${stock.toLocaleString()} on hand`
}

function stockClass(stock: number | null): string {
  if (stock == null) return 'text-medium-emphasis'
  return stock <= 0 ? 'text-error font-weight-bold' : 'text-success'
}

/**
 * 'ok' | 'expired' | 'short_dated' for one batch.
 *
 * Expiry alone is checked for every selling channel; the 18-month bar is added
 * only when the caller asks for it, because that is a GOVERNMENT CONTRACT term,
 * not a property of the goods — an outlet may sell a 3-month-dated box quite
 * legitimately.
 */
function batchState(row: ProductPickerResult): 'ok' | 'expired' | 'short_dated' {
  const shelf = govtShelfLife(row.expiry_date)
  if (!shelf.ok && shelf.reason === 'expired') return 'expired'
  if (!shelf.ok && props.requireShelfLife) return 'short_dated'
  return 'ok'
}

/** Expired stock is never sellable; short-dated is, with executive approval. */
function isSelectable(row: ProductPickerResult): boolean {
  return batchState(row) !== 'expired'
}

function isExpanded(name: string): boolean {
  return expandedNames.value.has(name)
}

function toggleExpand(name: string) {
  const next = new Set(expandedNames.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  expandedNames.value = next
}

/**
 * A name row: in `name` mode it always selects; in `batch` mode it selects only
 * when there is a single batch to select, otherwise it opens the batch list.
 */
function onGroupClick(group: NameGroup) {
  if (props.mode === 'name' || group.batches.length === 1) {
    pick(group.head)
    return
  }
  toggleExpand(group.name)
}

function pick(product: ProductPickerResult) {
  if (props.mode === 'batch' && !isSelectable(product)) return
  emit('select', product)
  close()
}

function close() {
  emit('update:modelValue', false)
}

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      searchInput.value = ''
      searchNow()
    }
  }
)
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    max-width="720"
    scrollable
  >
    <v-card rounded="lg">
      <v-card-title class="d-flex justify-space-between align-center pa-4">
        <div class="d-flex align-center">
          <v-icon icon="mdi-database-search-outline" size="26" class="mr-2 text-primary" />
          <span class="text-subtitle-1 font-weight-bold">
            {{ mode === 'batch' ? 'Select Batch' : 'Select Product' }}
          </span>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" @click="close" />
      </v-card-title>

      <v-divider />

      <div class="pa-4 pb-2">
        <v-text-field
          v-model="searchInput"
          placeholder="Search by product, brand or SKU..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          autofocus
          clearable
          @keyup.enter="searchNow"
        />
      </div>

      <v-card-text style="max-height: 420px" class="pt-0">
        <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-2" />

        <div v-if="!loading && groups.length === 0" class="text-center pa-8 text-medium-emphasis">
          No products found.
        </div>

        <v-list v-else lines="two" density="comfortable">
          <template v-for="group in groups" :key="group.name">
            <v-list-item class="product-row rounded-lg mb-1" @click="onGroupClick(group)">
              <template #title>
                <span class="font-weight-bold">{{ group.name || 'Unnamed product' }}</span>
              </template>
              <template #subtitle>
                <span class="text-caption">
                  <!-- Brand is shown because the search matches it: the row is
                       titled by molecule, so a "Fluimucil" hit would otherwise
                       look like an unrelated result. -->
                  <span v-if="group.head.brand" class="font-weight-medium">{{ group.head.brand }}</span>
                  <span v-if="group.head.brand"> · </span>{{ group.head.unit || 'unit' }}
                  <template v-if="mode === 'batch'">
                    ·
                    <span :class="stockClass(group.totalStock)">{{ stockLabel(group.totalStock) }}</span>
                    <template v-if="group.batches.length === 1">
                      · Exp {{ expiryLabel(group.head.expiry_date) }}
                    </template>
                  </template>
                  <span v-else> · {{ group.head.sku || 'no SKU' }}</span>
                </span>
              </template>
              <template #append>
                <div class="d-flex align-center ga-2">
                  <v-chip
                    v-if="mode === 'batch' && group.batches.length > 1"
                    size="x-small"
                    variant="tonal"
                    color="primary"
                  >
                    {{ group.batches.length }} batches
                  </v-chip>
                  <v-chip
                    v-else-if="mode === 'batch' && batchState(group.head) !== 'ok'"
                    size="x-small"
                    variant="flat"
                    :color="batchState(group.head) === 'expired' ? 'error' : 'warning'"
                  >
                    {{ batchState(group.head) === 'expired' ? 'EXPIRED' : 'NEEDS APPROVAL' }}
                  </v-chip>
                  <div v-if="showCost" class="text-right">
                    <div class="text-caption text-medium-emphasis">Cost</div>
                    <div class="text-body-2 font-weight-bold">
                      {{ formatCurrency(group.head.cost_price || 0) }}
                    </div>
                  </div>
                  <v-icon
                    v-if="mode === 'batch' && group.batches.length > 1"
                    :icon="isExpanded(group.name) ? 'mdi-chevron-up' : 'mdi-chevron-down'"
                    size="20"
                  />
                </div>
              </template>
            </v-list-item>

            <!-- Batch list. Only reachable in batch mode, and only for a name
                 holding more than one — a single batch is selected by its name
                 row, so opening a one-item sub-list would be a dead click. -->
            <template v-if="mode === 'batch' && group.batches.length > 1 && isExpanded(group.name)">
              <v-list-item
                v-for="batch in group.batches"
                :key="batch.id"
                class="batch-row rounded-lg mb-1 ml-6"
                :class="{ 'batch-row--blocked': !isSelectable(batch) }"
                @click="pick(batch)"
              >
                <template #title>
                  <span class="text-body-2">
                    Batch {{ batch.batch_no || '—' }} · Exp {{ expiryLabel(batch.expiry_date) }}
                  </span>
                </template>
                <template #subtitle>
                  <span class="text-caption" :class="stockClass(batch.stock)">
                    {{ stockLabel(batch.stock) }}
                  </span>
                </template>
                <template #append>
                  <v-chip
                    v-if="batchState(batch) === 'expired'"
                    size="x-small"
                    variant="flat"
                    color="error"
                  >
                    EXPIRED
                  </v-chip>
                  <v-chip
                    v-else-if="batchState(batch) === 'short_dated'"
                    size="x-small"
                    variant="flat"
                    color="warning"
                  >
                    NEEDS APPROVAL
                  </v-chip>
                </template>
              </v-list-item>
            </template>
          </template>

          <div v-if="hasMore && !loading" class="text-center pa-2">
            <v-btn
              variant="text"
              color="green"
              size="small"
              :loading="loadingMore"
              @click="loadMore"
            >
              See more
            </v-btn>
          </div>
        </v-list>
      </v-card-text>

      <template v-if="mode === 'batch' && requireShelfLife">
        <v-divider />
        <div class="pa-3 text-caption text-medium-emphasis">
          Government orders require at least {{ QUALIFICATION_MONTHS }} months of shelf life.
          Batches under that can still be ordered, but need executive approval before delivery.
        </div>
      </template>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.product-row,
.batch-row {
  cursor: pointer;
  transition: background-color 0.1s ease;
}
.product-row:hover,
.batch-row:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.05);
}
.batch-row--blocked {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
