<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useOrderDetail } from '../../composables/useOrderDetail'
import { useEthicalDataStore } from '@/stores/ethicalData'
import type { CollectionType } from '@/stores/ethicalData'
import EthicalInvoiceDialog from './EthicalInvoiceDialog.vue'
import DeliveryReceiptDialog from '@/components/deliveryReceipts/DeliveryReceiptDialog.vue'
import ChangeRequestDialog from '@/components/changeRequests/ChangeRequestDialog.vue'
import { useChangeRequestFiling } from '@/composables/useChangeRequestFiling'
import { useChangeRequestsDataStore } from '@/stores/changeRequestsData'
import { expensePaymentMethods } from '@/stores/financeData'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'
import { useDisplay } from 'vuetify'

const { mobile } = useDisplay()
const props = defineProps<{ modelValue: boolean; orderId: number | null }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const internalValue = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const showInvoice = ref(false)
const showReceipt = ref(false)

const ethical = useEthicalDataStore()
const order = computed(() => ethical.currentOrder)

const {
  loading, collectionAmount, collectionMethod, collectionReference,
  receivedBy, issuedReceipt, canIssueDR,
  requestedAt, requestNote,
  isInvoiced, isPartial, isPaid, isAwaitingStock, isCancellable, isOverdue, balance, shortfall, collections,
  collectionCashAccountId, cashAccountOptions,
  recordCollection, cancelOrder, markCommissionPaid, recheck, issueDR, notifyPurchasing,
} = useOrderDetail(() => order.value)

// Pop the printable DR as soon as one is issued.
watch(issuedReceipt, (dr) => { if (dr) showReceipt.value = true })

// Undoing a recorded collection now needs executive approval (void-only).
const { showDialog: crDialog, config: crConfig, isPending: crPending, loadPending: crLoad, open: crOpen, submit: crSubmit, submitting: crSubmitting } =
  useChangeRequestFiling(useChangeRequestsDataStore())
watch(collections, () => { void crLoad() }, { immediate: true })

function requestUndoCollection(c: CollectionType) {
  if (!order.value) return
  crOpen({
    // Must be the ORDER's transaction id — change_requests.transaction_id is
    // FK'd to transactions.id, and a collection is a `collections` row, not a
    // transactions row. Which collection this targets travels via meta below.
    id: order.value.id,
    ref: order.value.order_no ?? null,
    fields: [
      { key: 'amount', label: 'Amount', value: c.amount ?? 0, type: 'number' },
      { key: 'payment_method', label: 'Payment Method', value: c.payment_method, type: 'select', items: expensePaymentMethods.map((m) => ({ title: m.title, value: m.value })) },
      { key: 'reference_no', label: 'Reference / OR #', value: c.reference_no, type: 'text' },
    ],
    voidSummary: `Void this ${formatCurrency(c.amount ?? 0)} collection on ${order.value.order_no ?? 'the order'} — reverses it in the ledger (DR AR / CR cash) and rolls the order's paid amount + status back.`,
    allowEdit: true,
    allowVoid: true,
    meta: { __collection_id: { from: c.id, to: c.id } },
  })
}

const productName = (id: number) =>
  order.value?.items?.find((i) => i.product_id === id)?.product?.product_name ?? `#${id}`

const statusMeta = (status: string | null) => {
  const map: Record<string, { label: string; color: string }> = {
    invoiced: { label: 'Invoiced', color: 'warning' },
    partial: { label: 'Partial', color: 'info' },
    paid: { label: 'Paid', color: 'success' },
    cancelled: { label: 'Cancelled', color: 'error' },
  }
  return map[status ?? ''] ?? { label: '—', color: 'grey' }
}

watch(
  () => props.orderId,
  async (id) => {
    if (id && internalValue.value) {
      ethical.currentOrder = await ethical.fetchOrderById(id) || undefined
    }
  },
  { immediate: true },
)
</script>

<template>
  <v-dialog
    v-model="internalValue"
    :fullscreen="mobile"
    :max-width="mobile ? undefined : 1000"
    :transition="mobile ? 'dialog-bottom-transition' : undefined"
    persistent
  >
    <v-card v-if="order" :rounded="mobile ? '0' : 'lg'">
      <v-toolbar v-if="mobile" color="surface" density="comfortable">
        <v-btn icon="mdi-close" @click="internalValue = false" />
        <v-toolbar-title class="text-body-1 font-weight-bold">
          Order {{ order.order_no }}
        </v-toolbar-title>
        <v-chip :color="statusMeta(order.status).color" label size="small" class="mr-2">
          {{ statusMeta(order.status).label }}
        </v-chip>
      </v-toolbar>

      <v-card-title v-else class="pa-4 pa-sm-5 d-flex align-center ga-2">
        <v-icon icon="mdi-clipboard-text-outline" color="primary" />
        <span class="text-h6 font-weight-bold">Order {{ order.order_no }}</span>
        <v-spacer />
        <v-chip :color="statusMeta(order.status).color" label>{{ statusMeta(order.status).label }}</v-chip>
        <v-btn icon="mdi-close" @click="internalValue = false" />
      </v-card-title>
      <v-divider />

      <v-card-text class="pa-4 pa-sm-5">
        <!-- Meta -->
        <v-row dense class="mb-2">
          <v-col cols="12" sm="6" md="4">
            <div class="text-body-2">Customer: <strong>{{ order.customer?.name }}</strong></div>
          </v-col>
          <v-col cols="12" sm="6" md="4">
            <div class="text-body-2">Medical Sales Representative: <strong>{{ order.agent?.name }}</strong></div>
          </v-col>
          <v-col cols="12" sm="6" md="4">
            <div class="text-body-2">Due Date: <strong :class="{ 'text-error': isOverdue }">{{ order.due_date ? new Date(order.due_date).toLocaleDateString() : '—' }}</strong></div>
          </v-col>
          <v-col cols="12" sm="6" md="4">
            <div class="text-body-2">TIN: <strong>{{ order.customer?.tin_number || '—' }}</strong></div>
          </v-col>
          <v-col cols="12" sm="6" md="4">
            <v-chip size="small" :color="order.customer?.is_vat_registered ? 'primary' : 'grey'" variant="tonal">
              {{ order.customer?.is_vat_registered ? 'VAT-Registered' : 'Non-VAT' }}
            </v-chip>
          </v-col>
        </v-row>

        <v-divider class="my-4" />

        <h4 class="mb-2">Line Items</h4>

        <!-- MOBILE: line items cards -->
        <template v-if="mobile">
          <v-card
            v-for="item in order.items" :key="item.id"
            variant="outlined" rounded="lg" class="mb-2 pa-3"
          >
            <div class="font-weight-medium text-body-2">{{ item.product?.product_name }}</div>
            <div class="text-caption text-medium-emphasis mt-2">
              <div class="d-flex justify-space-between mb-1">
                <span>Qty</span>
                <span>{{ item.quantity }}</span>
              </div>
              <div class="d-flex justify-space-between mb-1">
                <span>Unit Price</span>
                <span>{{ formatCurrency(item.unit_price) }}</span>
              </div>
              <div class="d-flex justify-space-between">
                <span class="font-weight-bold">Total</span>
                <span class="font-weight-bold">{{ formatCurrency(item.line_total) }}</span>
              </div>
            </div>
          </v-card>
        </template>

        <!-- DESKTOP: line items table -->
        <v-table v-else dense class="detail-table">
          <thead>
            <tr>
              <th>Product</th>
              <th class="text-right">Qty</th>
              <th class="text-right">Unit Price</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in order.items" :key="item.id">
              <td>{{ item.product?.product_name }}</td>
              <td class="text-right">{{ item.quantity }}</td>
              <td class="text-right">{{ formatCurrency(item.unit_price) }}</td>
              <td class="text-right">{{ formatCurrency(item.line_total) }}</td>
            </tr>
          </tbody>
        </v-table>

        <div class="text-right mt-4 space-y-1">
          <div>Subtotal: {{ formatCurrency(order.subtotal ?? 0) }}</div>
          <div v-if="order.discount_amount">Discount: −{{ formatCurrency(order.discount_amount) }}</div>
          <div><strong>Invoice Total: {{ formatCurrency(order.total_amount ?? 0) }}</strong></div>
          <div>Amount Paid: {{ formatCurrency(order.amount_paid ?? 0) }}</div>
          <div class="text-lg font-weight-bold">Balance: {{ formatCurrency(balance) }}</div>
          <div v-if="order.rebate_amount" class="text-caption text-medium-emphasis mt-1">
            Rebate: {{ formatCurrency(order.rebate_amount) }} — paid separately, not part of the invoice
          </div>
        </div>

        <v-card v-if="isAwaitingStock" variant="outlined" rounded="lg" class="my-4 bg-orange-lighten-5">
          <v-card-title class="text-subtitle-2 font-weight-bold pa-3">Insufficient Stock</v-card-title>
          <v-divider />
          <v-card-text class="pa-3">
            <div class="text-caption text-medium-emphasis mb-2">
              Ethical, Exelmed, and warehouse stock combined still can't cover the following. Purchasing sources these items — re-check once stock has arrived.
            </div>
            <v-table density="compact">
              <thead><tr><th class="text-left">Product</th><th class="text-right">Ordered</th><th class="text-right">On hand</th><th class="text-right">Needed</th></tr></thead>
              <tbody>
                <tr v-for="s in shortfall" :key="s.product_id">
                  <td>{{ productName(s.product_id) }}</td><td class="text-right">{{ s.ordered }}</td>
                  <td class="text-right">{{ s.on_hand }}</td><td class="text-right text-error font-weight-bold">{{ s.needed }}</td>
                </tr>
              </tbody>
            </v-table>
            <v-btn variant="text" size="small" color="info" class="text-none mt-1" @click="recheck">Re-check stock</v-btn>

            <v-divider class="my-3" />
            <div class="text-subtitle-2 font-weight-bold mb-1">Notify Purchasing</div>
            <template v-if="requestedAt">
              <div class="text-caption text-success">
                <v-icon icon="mdi-check-circle" size="14" class="mr-1" />
                Sent to Purchasing on {{ formatDatePR_ISO(requestedAt) }}
              </div>
              <v-btn variant="text" size="small" color="info" class="text-none mt-1 pl-0" @click="requestedAt = null">
                Send again
              </v-btn>
            </template>
            <template v-else>
              <div class="text-caption text-medium-emphasis mb-2">Let Purchasing know these items need to be bought.</div>
              <v-textarea v-model="requestNote" placeholder="Note for Purchasing (optional)" variant="outlined" density="compact" rows="2" hide-details class="mb-2" />
              <v-btn color="info" size="small" class="text-none font-weight-bold" elevation="0" :loading="loading" @click="notifyPurchasing">
                Notify Purchasing
              </v-btn>
            </template>
          </v-card-text>
        </v-card>

        <v-divider class="my-4" />

        <h4 class="mb-2">Record Collection</h4>
        <v-row dense>
          <v-col cols="12" sm="6" md="4">
            <v-text-field
              v-model.number="collectionAmount"
              label="Amount"
              type="number"
              :max="balance"
              :disabled="isPaid"
            />
          </v-col>
          <v-col cols="12" sm="6" md="4">
            <v-text-field v-model="collectionMethod" label="Payment Method" :disabled="isPaid" />
          </v-col>
          <v-col cols="12" sm="6" md="4">
            <v-text-field v-model="collectionReference" label="Ref No" :disabled="isPaid" />
          </v-col>
          <!-- Where the money landed. Required: without it the payment never
               reaches cash_accounts.balance. -->
          <v-col cols="12" sm="6" md="4">
            <v-select
              v-model="collectionCashAccountId"
              :items="cashAccountOptions"
              label="Deposit To *"
              placeholder="Account that received it"
              :disabled="isPaid"
            />
          </v-col>
          <v-col cols="12" class="d-flex align-center mt-1">
            <v-btn
              color="success"
              :block="mobile"
              :disabled="isPaid || collectionAmount <= 0 || collectionCashAccountId === null"
              :loading="loading"
              @click="recordCollection"
            >
              Record
            </v-btn>
          </v-col>
        </v-row>

        <v-divider class="my-4" />

        <h4 class="mb-2">Collections History</h4>

        <!-- MOBILE: collection cards -->
        <template v-if="mobile">
          <v-card
            v-for="c in collections" :key="c.id"
            variant="outlined" rounded="lg" class="mb-2 pa-3"
          >
            <div class="d-flex align-center justify-space-between ga-2">
              <span class="font-weight-medium text-body-2">
                {{ c.created_at ? new Date(c.created_at).toLocaleDateString() : '—' }}
              </span>
              <v-chip size="x-small" :color="c.commission_status === 'paid' ? 'success' : 'warning'" variant="tonal">
                {{ c.commission_status }}
              </v-chip>
            </div>

            <div class="text-caption text-medium-emphasis mt-2">
              <div class="d-flex justify-space-between mb-1">
                <span>Amount</span>
                <span class="font-weight-medium">{{ formatCurrency(c.amount ?? 0) }}</span>
              </div>
              <div class="d-flex justify-space-between mb-1">
                <span>Method</span>
                <span>{{ c.payment_method || '—' }}</span>
              </div>
              <div class="d-flex justify-space-between">
                <span>Commission</span>
                <span class="font-weight-medium">{{ formatCurrency(c.commission_amount ?? 0) }}</span>
              </div>
            </div>

            <div class="d-flex flex-wrap ga-2 mt-2">
              <v-btn
                v-if="c.commission_status === 'unpaid'"
                size="small" variant="flat" color="primary" class="text-none"
                @click="markCommissionPaid(c)"
              >
                Mark Paid
              </v-btn>
              <v-chip v-if="crPending(c.id)" size="x-small" color="warning" variant="tonal" label>undo pending</v-chip>
              <v-btn
                v-else
                prepend-icon="mdi-pencil-box-outline" size="small" variant="tonal" color="primary" class="text-none"
                title="Request edit or undo of this collection (needs executive approval)" @click="requestUndoCollection(c)"
              >
                Request Change
              </v-btn>
            </div>
          </v-card>
        </template>

        <!-- DESKTOP: collections table -->
        <v-table v-else dense class="detail-table">
          <thead>
            <tr>
              <th>Date</th>
              <th class="text-right">Amount</th>
              <th>Method</th>
              <th class="text-right">Commission</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in collections" :key="c.id">
              <td>{{ c.created_at ? new Date(c.created_at).toLocaleDateString() : '—' }}</td>
              <td class="text-right">{{ formatCurrency(c.amount ?? 0) }}</td>
              <td>{{ c.payment_method || '—' }}</td>
              <td class="text-right">{{ formatCurrency(c.commission_amount ?? 0) }}</td>
              <td>
                <v-chip size="x-small" :color="c.commission_status === 'paid' ? 'success' : 'warning'">
                  {{ c.commission_status }}
                </v-chip>
              </td>
              <td class="d-flex align-center ga-1">
                <v-btn
                  v-if="c.commission_status === 'unpaid'"
                  size="x-small"
                  @click="markCommissionPaid(c)"
                >
                  Mark Paid
                </v-btn>
                <v-chip v-if="crPending(c.id)" size="x-small" color="warning" variant="tonal" label>undo pending</v-chip>
                <v-btn v-else prepend-icon="mdi-pencil-box-outline" size="small" variant="tonal" color="primary" class="text-none"
                  title="Request edit or undo of this collection (needs executive approval)" @click="requestUndoCollection(c)">
                  Request Change
                </v-btn>
              </td>
            </tr>
          </tbody>
        </v-table>

        <v-divider class="my-4" />

        <h4 class="mb-2">Delivery Receipt</h4>
        <div class="text-caption text-medium-emphasis mb-2">
          Issue a signed proof-of-delivery for the fulfilled quantities. Re-issue for a reprint or second copy.
        </div>
        <v-row dense>
          <v-col cols="12" sm="6">
            <v-text-field v-model="receivedBy" label="Received by (consignee)" placeholder="Printed name on the DR"
              variant="outlined" density="compact" hide-details />
          </v-col>
          <v-col cols="12" sm="auto" class="d-flex align-center mt-2 mt-sm-0">
            <v-btn color="teal" class="text-none font-weight-bold" elevation="0" prepend-icon="mdi-truck-check"
              :block="mobile" :disabled="!canIssueDR" :loading="loading" @click="issueDR">
              Issue Delivery Receipt
            </v-btn>
          </v-col>
        </v-row>
      </v-card-text>

      <template v-if="!mobile">
        <v-divider />
        <v-card-actions>
          <v-btn
            v-if="isCancellable"
            color="error"
            :loading="loading"
            @click="cancelOrder"
          >
            Cancel Order
          </v-btn>
          <v-spacer />
          <v-btn variant="text" prepend-icon="mdi-printer" @click="showInvoice = true">Print Invoice</v-btn>
          <v-btn @click="internalValue = false">Close</v-btn>
        </v-card-actions>
      </template>
    </v-card>
  </v-dialog>

  <EthicalInvoiceDialog v-model="showInvoice" :order="order ?? null" />
  <DeliveryReceiptDialog v-model="showReceipt" :receipt="issuedReceipt" />

  <ChangeRequestDialog
    v-if="crConfig"
    v-model="crDialog"
    :target-ref="crConfig.ref"
    :fields="crConfig.fields"
    :allow-edit="crConfig.allowEdit"
    :allow-void="crConfig.allowVoid"
    :void-summary="crConfig.voidSummary"
    :loading="crSubmitting"
    @submit="crSubmit" />
</template>

<style scoped>
.detail-table :deep(tbody tr:hover) {
  background: rgba(var(--v-theme-primary), 0.04);
}
</style>