<script setup lang="ts">
import { watch, ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useSupplierOffersDataStore } from '@/stores/supplierOffersData'
import { useSuppliersDataStore } from '@/stores/suppliersData'
import type { SupplierOfferType } from '@/stores/supplierOffersData'
import { qualifyOffers, minQualifyingExpiry, type QualifiedOffer } from '@/utils/qualification'
import { maskMonthYearInput, parseMonthYear } from '@/utils/helpers'

const props = defineProps<{
  modelValue: boolean
  product: { id: number; name?: string | null } | null
  requiredByDate: string
  qty: number
  minQty?: number
  selectedOffer?: { id: number; supplier_id: number; supplier_name?: string | null } | null
  initialJustification?: string | null
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'update:qty', v: number): void
  (e: 'confirm', payload: { offer: QualifiedOffer; consideredOffers: QualifiedOffer[]; justification: string | null }): void
}>()

const offersStore = useSupplierOffersDataStore()
const suppliersStore = useSuppliersDataStore()
const { suppliers } = storeToRefs(suppliersStore)

const pendingRowIdx = ref<number | null>(null)
const justification = ref('')

type DraftRow = { supplier_id: number | null; price: number | null; expiry: string }
const draftRows = ref<DraftRow[]>([])
const saving = ref(false)
const loadingRows = ref(false)

const blankRow = (): DraftRow => ({ supplier_id: null, price: null, expiry: '' })

function dateToMonthYear(date: string | null): string {
  if (!date) return ''
  const [year, month] = date.split('-')
  return year && month ? `${month}/${year}` : ''
}

async function prefillRows(productId: number): Promise<DraftRow[]> {
  const offers = await offersStore.fetchOffersForProduct(productId, true)

  const pinnedId = props.selectedOffer?.id
  const newestBySupplier = new Map<number, SupplierOfferType>()
  for (const offer of offers) {
    const kept = newestBySupplier.get(offer.supplier_id)
    if (kept && kept.id === pinnedId) continue
    if (!kept || offer.id === pinnedId || offer.created_at > kept.created_at) {
      newestBySupplier.set(offer.supplier_id, offer)
    }
  }

  return [...newestBySupplier.values()].map((offer) => ({
    supplier_id: offer.supplier_id,
    price: offer.cost_price_per_unit,
    expiry: dateToMonthYear(offer.expiry_date),
  }))
}

function addDraftRow() {
  draftRows.value.push({ supplier_id: null, price: null, expiry: '' })
}
function removeDraftRow(idx: number) {
  draftRows.value.splice(idx, 1)
  if (pendingRowIdx.value === idx) pendingRowIdx.value = null
  else if (pendingRowIdx.value != null && pendingRowIdx.value > idx) pendingRowIdx.value -= 1
}

const supplierOptions = () =>
  suppliers.value.filter((s) => s.is_active !== false).map((s) => ({ title: s.name ?? `Supplier ${s.id}`, value: s.id }))

function availableSupplierOptions(rowIdx: number) {
  const takenElsewhere = new Set(
    draftRows.value.filter((_, i) => i !== rowIdx).map((r) => r.supplier_id).filter((id): id is number => id != null),
  )
  const options = supplierOptions().filter((o) => !takenElsewhere.has(o.value))

  const own = draftRows.value[rowIdx]?.supplier_id
  if (own != null && !options.some((o) => o.value === own)) {
    const name = supplierName(own) ?? props.selectedOffer?.supplier_name ?? `Supplier ${own}`
    options.unshift({ title: name, value: own })
  }
  return options
}

function supplierName(id: number | null): string | null {
  return suppliers.value.find((s) => s.id === id)?.name ?? null
}

function monthYearToDate(mmYYYY: string): string | null {
  const parsed = parseMonthYear(mmYYYY)
  if (!parsed) return null
  const lastDay = new Date(parsed.getFullYear(), parsed.getMonth() + 1, 0)
  return lastDay.toISOString().slice(0, 10)
}

const candidateOffers = computed<Map<number, SupplierOfferType>>(() => {
  const byRow = new Map<number, SupplierOfferType>()
  const product = props.product
  if (!product) return byRow
  draftRows.value.forEach((row, idx) => {
    if (row.supplier_id == null || !row.price) return
    byRow.set(idx, {
      id: -(idx + 1),
      supplier_id: row.supplier_id,
      supplier_name: supplierName(row.supplier_id),
      product_id: product.id,
      cost_price_per_unit: row.price,
      currency: 'PHP',
      expiry_date: monthYearToDate(row.expiry),
      source: 'canvass',
      created_by: null,
      created_at: '',
    })
  })
  return byRow
})

const qualification = computed(() =>
  qualifyOffers([...candidateOffers.value.values()], props.requiredByDate),
)
const candidateFor = (idx: number): SupplierOfferType | null => candidateOffers.value.get(idx) ?? null

watch(() => props.modelValue, async (open) => {
  if (!open) return
  pendingRowIdx.value = null
  justification.value = props.initialJustification ?? ''
  draftRows.value = []

  loadingRows.value = true
  if (!suppliers.value.length) await suppliersStore.fetchSuppliers({ activeOnly: true })
  const product = props.product
  const existing = product ? await prefillRows(product.id) : []
  draftRows.value = existing

  const supplierId = props.selectedOffer?.supplier_id
  const idx = supplierId == null
    ? -1
    : draftRows.value.findIndex((r) => r.supplier_id === supplierId)
  pendingRowIdx.value = idx === -1 ? null : idx

  loadingRows.value = false
})

const pendingOffer = computed(() => (pendingRowIdx.value != null ? candidateFor(pendingRowIdx.value) : null))
const needsJustification = computed(() => {
  const rec = qualification.value.recommended
  return pendingOffer.value != null && rec != null && pendingOffer.value.id !== rec.id
})

function pick(rowIdx: number) {
  if (!candidateFor(rowIdx)) return
  pendingRowIdx.value = rowIdx
}
function onExpiryInput(row: DraftRow, raw: string) {
  row.expiry = maskMonthYearInput(raw)
}

const localQty = ref(props.qty)
watch(() => props.qty, (v) => { localQty.value = v })
function commitQty() {
  const q = localQty.value || 1
  if (q !== props.qty) emit('update:qty', q)
}

const belowShortfall = computed(() => props.minQty != null && localQty.value < props.minQty)

function monthsUntilQualifying(idx: number): number | null {
  const offer = candidateFor(idx)
  if (!offer?.expiry_date) return null
  const minExpiry = minQualifyingExpiry(props.requiredByDate)
  return Math.round((new Date(offer.expiry_date).getTime() - minExpiry.getTime()) / (1000 * 60 * 60 * 24 * 30.44))
}
function formatMonths(mo: number): string {
  return `${mo > 0 ? '+' : ''}${mo} mo`
}
type RowStatus = 'recommended' | 'qualifies' | 'too-soon'

function rowStatus(idx: number): RowStatus | null {
  const offer = candidateFor(idx)
  if (!offer) return null
  if (qualification.value.recommended?.id === offer.id) return 'recommended'
  return qualification.value.qualified.some((o) => o.id === offer.id) ? 'qualifies' : 'too-soon'
}
function monthsLabel(idx: number): string | null {
  const mo = monthsUntilQualifying(idx)
  return mo == null ? null : formatMonths(mo)
}
function monthsClass(idx: number): string {
  const mo = monthsUntilQualifying(idx)
  return mo == null ? '' : mo >= 0 ? 'text-success' : 'text-warning'
}


async function onConfirm() {
  const product = props.product
  if (pendingRowIdx.value == null || !product) return
  commitQty()
  saving.value = true
  const considered: QualifiedOffer[] = []
  let confirmedOffer: SupplierOfferType | null = null
  for (const [idx, row] of draftRows.value.entries()) {
    if (row.supplier_id == null || !row.price) continue
    const offer = await offersStore.createOffer({
      supplierId: row.supplier_id, productId: product.id,
      costPricePerUnit: row.price, expiryDate: monthYearToDate(row.expiry), source: 'canvass',
    })
    if (!offer) continue
    considered.push({ ...offer, months_to_expiry: 0 })
    if (idx === pendingRowIdx.value) confirmedOffer = offer
  }
  saving.value = false
  if (!confirmedOffer) return
  emit('confirm', {
    offer: { ...confirmedOffer, months_to_expiry: 0 },
    consideredOffers: considered,
    justification: needsJustification.value ? (justification.value || null) : null,
  })
  emit('update:modelValue', false)
}
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="850" scrollable @update:model-value="emit('update:modelValue', $event)">
    <v-card v-if="product" rounded="lg">
      <v-card-title class="pa-4 pb-2">
        <div class="text-h6 font-weight-bold">Compare Suppliers — {{ product.name }}</div>
        <div class="d-flex align-center flex-wrap mt-2" style="gap:16px">
          <div class="text-caption text-medium-emphasis">
            Required by {{ requiredByDate }} · min. qualifying expiry is 18 months after that date
          </div>
          <v-text-field v-model.number="localQty" type="number" :min="minQty ?? 1" label="Quantity" density="compact" variant="outlined" hide-details style="max-width:120px" @blur="commitQty" />
        </div>
        <v-alert v-if="belowShortfall" type="warning" density="compact" variant="tonal" class="mt-2">
          Quantity is below the shortfall ({{ minQty }}).
        </v-alert>
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-4">
        <div class="text-caption font-weight-bold mb-2">
          Quotes already on file are filled in — edit them or add another supplier. Pick any row;
          the cheapest qualifying offer is only a recommendation.
        </div>
        <v-progress-linear v-if="loadingRows" indeterminate class="mb-2" />

        <v-table density="compact" class="mb-2" style="width:100%">
          <colgroup>
            <col style="width:auto; min-width:200px" />   
            <col style="width:auto; min-width:150px" />   
            <col style="width:auto; min-width:130px" />                 
            <col style="width:130px" />                   
            <col style="width:90px" />                     
            <col style="width:40px" />                     
          </colgroup>
          <thead>
            <tr>
              <th class="text-left">Supplier</th><th class="text-right">Price/Unit</th>
              <th>Expiry</th><th class="text-left">Status</th>
              <th></th><th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in draftRows" :key="idx">
              <td>
                <v-autocomplete v-model="row.supplier_id" :items="availableSupplierOptions(idx)" placeholder="Supplier"
                  density="compact" variant="outlined" hide-details />
              </td>
              <td>
                <v-text-field v-model.number="row.price" type="number" min="0" prefix="₱" placeholder="Price/Unit"
                  density="compact" variant="outlined" hide-details />
              </td>
              <td>
                <v-text-field :model-value="row.expiry" placeholder="MM/YYYY" maxlength="7" inputmode="numeric"
                  density="compact" variant="outlined" hide-details style="width:100%; min-width:0"
                  @update:model-value="onExpiryInput(row, $event)" />
              </td>
              <td>
                <template v-if="rowStatus(idx)">
                  <div class="d-flex align-center" style="gap:6px">
                    <v-chip v-if="rowStatus(idx) === 'recommended'" color="success" size="x-small" label>Recommended</v-chip>
                    <v-chip v-else-if="rowStatus(idx) === 'qualifies'" color="info" variant="tonal" size="x-small" label>Qualifies</v-chip>
                    <v-chip v-else color="warning" variant="tonal" size="x-small" label>Expiry too soon</v-chip>
                    <span
                      v-if="monthsLabel(idx)"
                      class="text-caption font-weight-medium"
                      :class="monthsClass(idx)"
                      style="white-space:nowrap; padding:0 6px; border-radius:8px; line-height:1.6"
                    >
                      {{ monthsLabel(idx) }}
                    </span>
                  </div>
                </template>
                <span v-else class="text-caption text-medium-emphasis">Incomplete</span>
              </td>
              <td>
                <v-btn size="x-small" variant="tonal" :disabled="!candidateFor(idx)"
                  :color="pendingRowIdx === idx ? 'primary' : undefined" class="text-none" @click="pick(idx)">
                  {{ pendingRowIdx === idx ? 'Selected' : 'Select' }}
                </v-btn>
              </td>
              <td><v-btn icon="mdi-close" variant="text" size="x-small" @click="removeDraftRow(idx)" /></td>
            </tr>
          </tbody>
        </v-table>

        <v-btn variant="text" size="small" color="info" class="text-none" prepend-icon="mdi-plus" @click="addDraftRow">
          Add another supplier
        </v-btn>

        <v-textarea v-if="needsJustification" v-model="justification"
          label="Justification for overriding the recommended supplier (optional)"
          rows="2" variant="outlined" density="compact" class="mt-4" hide-details />
      </v-card-text>
      <v-divider />
      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn variant="text" class="text-none" @click="emit('update:modelValue', false)">Cancel</v-btn>
        <v-btn color="primary" variant="flat" class="text-none font-weight-bold" :loading="saving"
          :disabled="pendingRowIdx == null || belowShortfall" @click="onConfirm">
          Confirm Selection
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
