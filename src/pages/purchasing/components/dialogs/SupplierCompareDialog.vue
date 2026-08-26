<script setup lang="ts">
import { watch, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useSupplierOffersDataStore } from '@/stores/supplierOffersData'
import { useSuppliersDataStore } from '@/stores/suppliersData'
import { qualifyOffers, type QualifiedOffer } from '@/utils/qualification'
import { formatCurrency } from '@/utils/helpers'
import { maskMonthYearInput, parseMonthYear } from '@/utils/helpers'


const props = defineProps<{
  modelValue: boolean
  product: { id: number; name?: string | null } | null
  requiredByDate: string
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'confirm', payload: { offer: QualifiedOffer; consideredOffers: QualifiedOffer[]; justification: string | null }): void
}>()

const offersStore = useSupplierOffersDataStore()
const suppliersStore = useSuppliersDataStore()
const { suppliers } = storeToRefs(suppliersStore)

const loading = ref(false)
const qualified = ref<QualifiedOffer[]>([])
const disqualified = ref<QualifiedOffer[]>([])
const recommended = ref<QualifiedOffer | null>(null)
const pendingSelection = ref<QualifiedOffer | null>(null)
const justification = ref('')

// Draft rows — several suppliers entered together, saved as one batch.
type DraftRow = { supplier_id: number | null; price: number | null; expiry: string }
const draftRows = ref<DraftRow[]>([])
const saving = ref(false)

function addDraftRow() {
  draftRows.value.push({ supplier_id: null, price: null, expiry: '' })
}
function removeDraftRow(idx: number) {
  draftRows.value.splice(idx, 1)
}

const supplierOptions = () =>
  suppliers.value.filter((s) => s.is_active !== false).map((s) => ({ title: s.name ?? `Supplier ${s.id}`, value: s.id }))

// A supplier already used in another draft row (or already an existing offer)
// is hidden from later rows — same "no duplicate supplier per item" rule the
// old canvass enforced.
function availableSupplierOptions(rowIdx: number) {
  const takenElsewhere = new Set([
    ...qualified.value.map((o) => o.supplier_id),
    ...disqualified.value.map((o) => o.supplier_id),
    ...draftRows.value.filter((_, i) => i !== rowIdx).map((r) => r.supplier_id).filter((id): id is number => id != null),
  ])
  return supplierOptions().filter((o) => !takenElsewhere.has(o.value))
}

async function reload() {
  if (!props.product) return
  loading.value = true
  const offers = await offersStore.fetchOffersForProduct(props.product.id, true)
  const result = qualifyOffers(offers, props.requiredByDate)
  qualified.value = result.qualified
  disqualified.value = result.disqualified
  recommended.value = result.recommended
  loading.value = false
}

watch(() => props.modelValue, async (open) => {
  if (!open || !props.product) return
  if (!suppliers.value.length) await suppliersStore.fetchSuppliers({ activeOnly: true })
  pendingSelection.value = null
  justification.value = ''
  // Start with 3 blank rows — this is a "compare at least 3" workflow.
  draftRows.value = [{ supplier_id: null, price: null, expiry: '' }, { supplier_id: null, price: null, expiry: '' }, { supplier_id: null, price: null, expiry: '' }]
  await reload()
})

const needsJustification = () =>
  pendingSelection.value != null && recommended.value != null && pendingSelection.value.id !== recommended.value.id

function pick(offer: QualifiedOffer) {
  if (!qualified.value.some((o) => o.id === offer.id)) return
  pendingSelection.value = offer
}

function onConfirm() {
  if (!pendingSelection.value) return
  emit('confirm', {
    offer: pendingSelection.value,
    consideredOffers: [...qualified.value, ...disqualified.value],
    justification: needsJustification() ? (justification.value || null) : null,
  })
  emit('update:modelValue', false)
}
function onExpiryInput(row: DraftRow, raw: string) {
  row.expiry = maskMonthYearInput(raw)
}
function monthYearToDate(mmYYYY: string): string | null {
  const parsed = parseMonthYear(mmYYYY)
  if (!parsed) return null
  const lastDay = new Date(parsed.getFullYear(), parsed.getMonth() + 1, 0)
  return lastDay.toISOString().slice(0, 10)
}

async function saveAndCompare() {
  if (!props.product) return
  const filled = draftRows.value.filter((r) => r.supplier_id != null && r.price && r.expiry)
  if (!filled.length) return

  saving.value = true
  for (const row of filled) {
    const expiryDate = monthYearToDate(row.expiry)
    if (!expiryDate) continue // invalid/partial MM/YYYY — skip rather than save garbage
    await offersStore.createOffer({
      supplierId: row.supplier_id!, productId: props.product.id,
      costPricePerUnit: row.price!, expiryDate, source: 'canvass',
    })
  }
  saving.value = false
  draftRows.value = draftRows.value.filter((r) => !filled.includes(r))
  if (!draftRows.value.length) draftRows.value.push({ supplier_id: null, price: null, expiry: '' })
  await reload()
}
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="820" scrollable @update:model-value="emit('update:modelValue', $event)">
    <v-card v-if="product" rounded="lg">
      <v-card-title class="pa-4 pb-2">
        <div class="text-h6 font-weight-bold">Compare Suppliers — {{ product.name }}</div>
        <div class="text-caption text-medium-emphasis">
          Required by {{ requiredByDate }} · min. qualifying expiry is 18 months after that date
        </div>
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-4">
        <v-progress-linear v-if="loading" indeterminate class="mb-3" />

        <template v-else>
          <template v-if="qualified.length">
            <div class="text-caption font-weight-bold mb-1">Qualifying offers</div>
            <v-table density="compact" class="mb-3">
              <thead>
                <tr>
                  <th class="text-left">Supplier</th><th class="text-right">Price/Unit</th>
                  <th class="text-left">Expiry</th><th style="width:100px"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="o in qualified" :key="o.id">
                  <td>
                    {{ o.supplier_name }}
                    <v-chip v-if="recommended?.id === o.id" color="success" size="x-small" class="ml-1" label>Recommended</v-chip>
                  </td>
                  <td class="text-right">{{ formatCurrency(o.cost_price_per_unit) }}</td>
                  <td>{{ o.expiry_date }} ({{ o.months_to_expiry }}mo)</td>
                  <td>
                    <v-btn size="x-small" variant="tonal" :color="pendingSelection?.id === o.id ? 'primary' : undefined"
                      class="text-none" @click="pick(o)">
                      {{ pendingSelection?.id === o.id ? 'Selected' : 'Select' }}
                    </v-btn>
                  </td>
                </tr>
              </tbody>
            </v-table>
          </template>

          <template v-if="disqualified.length">
            <div class="text-caption font-weight-bold mb-1 text-medium-emphasis">Disqualified (expiry too soon)</div>
            <v-table density="compact" class="mb-3">
              <tbody>
                <tr v-for="o in disqualified" :key="o.id" class="text-medium-emphasis">
                  <td>{{ o.supplier_name }}</td>
                  <td class="text-right">{{ formatCurrency(o.cost_price_per_unit) }}</td>
                  <td>{{ o.expiry_date ?? '—' }} ({{ o.months_to_expiry }}mo)</td>
                </tr>
              </tbody>
            </v-table>
          </template>

          <div v-if="!qualified.length && !disqualified.length" class="text-center py-4 mb-2">
            <v-icon icon="mdi-alert-circle-outline" size="40" color="warning" class="mb-2" />
            <div class="text-body-1 font-weight-bold">No qualifying supplier found.</div>
          </div>

          <v-divider class="my-3" />
          <div class="text-caption font-weight-bold mb-2">Enter supplier quotes to compare</div>

          <div v-for="(row, idx) in draftRows" :key="idx" class="d-flex align-center mb-2" style="gap:8px">
            <v-autocomplete v-model="row.supplier_id" :items="availableSupplierOptions(idx)" placeholder="Supplier"
              density="compact" variant="outlined" hide-details style="flex:1" />
            <v-text-field v-model.number="row.price" type="number" min="0" prefix="₱" placeholder="Price/Unit"
              density="compact" variant="outlined" hide-details style="max-width:130px" />
            <v-text-field
            :model-value="row.expiry" placeholder="MM/YYYY" maxlength="7" inputmode="numeric"
            density="compact" variant="outlined" hide-details style="max-width:120px"
            @update:model-value="onExpiryInput(row, $event)" />
            <v-btn icon="mdi-close" variant="text" size="x-small" @click="removeDraftRow(idx)" />
          </div>

          <div class="d-flex justify-space-between align-center mt-2">
            <v-btn variant="text" size="small" color="info" class="text-none" prepend-icon="mdi-plus" @click="addDraftRow">
              Add another supplier
            </v-btn>
            <v-btn size="small" color="primary" variant="flat" class="text-none" :loading="saving" @click="saveAndCompare">
              Save &amp; Compare
            </v-btn>
          </div>

          <v-textarea v-if="needsJustification()" v-model="justification"
            label="Justification for overriding the recommended supplier (optional)"
            rows="2" variant="outlined" density="compact" class="mt-4" hide-details />
        </template>
      </v-card-text>
      <v-divider />
      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn variant="text" class="text-none" @click="emit('update:modelValue', false)">Cancel</v-btn>
        <v-btn color="primary" variant="flat" class="text-none font-weight-bold" :disabled="!pendingSelection" @click="onConfirm">
          Confirm Selection
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>