<script setup lang="ts">
import { usePurchaseRequisitionList } from '../composables/usePurchaseRequisitionList'
import type { ReorderPrefillItem } from '../composables/usePurchaseRequisition'
import PurchaseRequisitionDialog from './dialogs/PurchaseRequisitionDialog.vue'
import PurchaseRequisitionTable from './PurchaseRequisitionTable.vue'
import PurchaseRequisitionListMobile from '../mobile/PurchaseRequisitionListMobile.vue'
import StatCard from './StatCard.vue'
import { usePurchaseRequisitionStore } from '@/stores/purchaseRequisitionData'
import ReorderRequestsDialog from './dialogs/ReorderRequestsDialog.vue'
import PRDraftsDialog from './dialogs/PRDraftsDialog.vue'
import PRDetailModal from './dialogs/PRDetailModal.vue'
import IssuePOModal from './dialogs/IssuePOModal.vue'
import ProductFormDialog from '@/components/products/dialogs/ProductFormDialog.vue'
import { useProductCreateForm } from '@/components/products/composables/useProductCreateForm'
import { useAuthUserStore } from '@/stores/authUser'
import { isProductEditRestricted } from '@/utils/roleHelpers'
import { ref, onMounted, watch, computed } from 'vue'
import { useDisplay } from 'vuetify'
import { useToast } from 'vue-toastification'

const prStore = usePurchaseRequisitionStore()
const toast = useToast()

const selectedReorderIds = ref<number[]>([])
const prefillItemsForDialog = ref<ReorderPrefillItem[]>([])

const {
  stats,
  init,
  loading,
  selectedPR,
  filterStatus,
  serverItems,
  loadItems,
  page,
  totalItems,
  itemsPerPage,
  showModal,
  showPOModal,
  selectedPRForPO,
  searchInput,
  commitSearch,
  clearSearch,
  openDetail,
  openConfirm,
  handleUnapprove,
  openPurchaseOrder,
  openReorderDialog,
  reorderRequests,
  showReorderDialog,
  reorderCount,
  manualDrafts,
  manualDraftCount,
  showDraftsDialog,
  draftsLoading,
  openDraftsDialog,
  deleteDraft,
  refreshDraftCount,
  loadStats,
  refresh,
  // proposeEditPR,
} = usePurchaseRequisitionList()
const { mobile } = useDisplay()

// Inline "Add product" flow (mirrors ProductsWidget) so a user building a PR can
// create a missing product without leaving this page. Gated with the same
// restriction as the Products page: hidden for Warehouse (3) & Purchaser (4).
const authUser = useAuthUserStore()
const canAddProduct = computed(() => !isProductEditRestricted(authUser.userRole))
const {
  showDialog: showProductDialog,
  form: productFormRef,
  dialogMode: productDialogMode,
  productForm,
  loading: productLoading,
  rules: productRules,
  openCreateDialog: openCreateProductDialog,
  closeDialog: closeProductDialog,
  handleSubmit: handleProductSubmit,
} = useProductCreateForm()

onMounted(() => {
  init()
  if (mobile.value) {
      loadItems({ page: 1, itemsPerPage: itemsPerPage.value, sortBy: [] })
    }
})
const showNewPRDialog = ref(false)
const resumeDraftId = ref<number | null>(null)

// Clear prefill items when the dialog is closed without submitting
watch(showNewPRDialog, (isOpen) => {
  if (!isOpen) {
    prefillItemsForDialog.value = []
  }
})

// Clear reorder selection when the reorder dialog is closed
watch(() => showReorderDialog.value, (isOpen) => {
  if (!isOpen) {
    selectedReorderIds.value = []
  }
})

function goToPage(p: number) {
  // window.scrollTo({ top: 100, behavior: 'smooth' as ScrollBehavior })
  page.value = p
  loadItems({ page: p, itemsPerPage: itemsPerPage.value, sortBy: [] })
}

function createPRFromReorder() {
  prefillItemsForDialog.value = reorderRequests.value
    .filter(r => selectedReorderIds.value.includes(r.id))
    .filter(r => r.product) // guard against orphaned rows
    .map(r => {
      const shortfall = (r.product.reorder_level ?? 0) - (r.product.current_stock ?? 0)
      return {
        reorder_request_id: r.id,
        product_id:         r.product.id,
        product_name:   r.product.product_name ?? '',
        unit:                r.product.unit ?? 'Box',
        supplier_id:         r.product.supplier_id ?? null,
        cost_per_unit:       r.product.cost_price ?? 0,
        suggested_qty:       Math.max(shortfall, 1),
      }
    })

  resumeDraftId.value = null
  showReorderDialog.value = false
  showNewPRDialog.value = true
}

function openNewPR() {
  resumeDraftId.value = null
  prefillItemsForDialog.value = []
  showNewPRDialog.value = true
}

function onResumeDraft(draftId: number) {
  prefillItemsForDialog.value = []
  resumeDraftId.value = draftId
  showNewPRDialog.value = true
}

async function onDeleteDraft(draftId: number) {
  await deleteDraft(draftId)
}

async function onDraftSaved() {
  resumeDraftId.value = null
  await refreshDraftCount()
}

function onPRSubmitted() {
  page.value = 1
  loadItems({ page: 1, itemsPerPage: itemsPerPage.value, sortBy: [] })
  selectedReorderIds.value = []
  prefillItemsForDialog.value = []
  resumeDraftId.value = null
  refreshDraftCount()
}

// PurchaseRequisitionList.vue — restore the direct-save version
async function onPRUpdate(data: { items: any[]; remarks: string; charges?: any | null }) {
  if (!selectedPR.value) return
  const success = await prStore.updatePR({
    prId: selectedPR.value.id,
    items: data.items,
    remarks: data.remarks,
    ...(data.charges ? { charges: data.charges } : {}),
  })
  if (success) {
    showModal.value = false
    loadItems({ page: page.value, itemsPerPage: itemsPerPage.value, sortBy: [] })
  }
}

// Confirmed supplier changes create replacement PRs, keeping the original pending approval; each save/create handler refreshes the list independently.
async function onPRReplacement(data: {
  items: any[]
  charges: any | null
  newSupplierId: number
  originalPrId: number
  purchase_requisition_date: string | null
}) {
  const result = await prStore.createReplacementPR({
    originalPrId: data.originalPrId,
    items: data.items,
    charges: data.charges,
    newSupplierId: data.newSupplierId,
    purchase_requisition_date: data.purchase_requisition_date,
  })
  if (result.success) {
    showModal.value = false
    loadItems({ page: page.value, itemsPerPage: itemsPerPage.value, sortBy: [] })
  }
}

async function onPRSplitSave(data: {
  pr: any
  originalRows: any[]
  originalRemarks: string
  originalCharges: any | null
  replacements: {
    items: any[]
    charges: any | null
    newSupplierId: number
    originalPrId: number
    purchase_requisition_date: string | null
  }[]
}) {
  if (!selectedPR.value) return

  async function rollbackCreatedReplacements(
    replacements: { transactionId: number; createdProductIds: number[] }[],
  ): Promise<boolean> {
    for (const created of replacements) {
      const rollback = await prStore.deleteReplacementPR(
        created.transactionId,
        created.createdProductIds,
      )
      if (!rollback.success) {
        toast.error(`Failed to fully roll back a replacement PR: ${rollback.error ?? 'Unknown error'}`)
        return false
      }
    }
    return true
  }

  const createdReplacements: { transactionId: number; createdProductIds: number[] }[] = []
  for (const replacement of data.replacements) {
    const result = await prStore.createReplacementPR({
      originalPrId: replacement.originalPrId,
      items: replacement.items,
      charges: replacement.charges,
      newSupplierId: replacement.newSupplierId,
      purchase_requisition_date: replacement.purchase_requisition_date,
    })
    if (!result.success || result.transactionId == null) {
      await rollbackCreatedReplacements(createdReplacements)
      return
    }
    createdReplacements.push({
      transactionId: result.transactionId,
      createdProductIds: result.createdProductIds ?? [],
    })
  }

  const updated = await prStore.updatePR({
    prId: selectedPR.value.id,
    items: data.originalRows,
    remarks: data.originalRemarks,
    ...(data.originalCharges ? { charges: data.originalCharges } : {}),
  })
  if (!updated) {
    await rollbackCreatedReplacements(createdReplacements)
    return
  }

  showModal.value = false
  loadItems({ page: page.value, itemsPerPage: itemsPerPage.value, sortBy: [] })
}

async function onPOIssued() {
  // Refresh the table + stat cards after a purchase order is issued
  await Promise.all([
    loadItems({ page: page.value, itemsPerPage: itemsPerPage.value, sortBy: [] }),
    loadStats(),
  ])
}
</script>

<template>
  <v-container fluid class="pa-2 fill-height align-start">

    <div class="stats-grid mb-2">
      <StatCard
        title="Total PRs"
        icon="mdi-file-document-multiple-outline"
        color="purple"
        value-class="text-purple"
        :value="stats.total.toLocaleString()"
        @click="filterStatus = null"
      />
      <StatCard
        title="Reorder Requests"
        icon="mdi-cart-arrow-down"
        color="teal"
        value-class="text-teal"
        :value="reorderCount.toLocaleString()"
        @click="openReorderDialog"
      />
      <StatCard
        title="Drafts"
        icon="mdi-content-save-outline"
        color="blue-grey"
        value-class="text-blue-grey"
        :value="manualDraftCount.toLocaleString()"
        @click="openDraftsDialog"
      />
      <StatCard
        title="Pending Approval"
        icon="mdi-clock-alert-outline"
        color="#c2922e"
        :value="stats.pending.toLocaleString()"
        :active="filterStatus === 'pending_approval'"
        @click="filterStatus = 'pending_approval'"
      />
      <StatCard
        title="Approved"
        icon="mdi-check-circle-outline"
        color="#2563EB"
        :value="stats.approved.toLocaleString()"
        :active="filterStatus === 'approved'"
        @click="filterStatus = 'approved'"
      />
      <StatCard
        title="Rejected"
        icon="mdi-close-circle-outline"
        color="#DC2626"
        :value="stats.rejected.toLocaleString()"
        :active="filterStatus === 'rejected'"
        @click="filterStatus = 'rejected'"
      />
    </div>

    <!-- V-Data-Table -->
    <PurchaseRequisitionTable
      v-if="!mobile"
      v-model:search-input="searchInput"
      v-model:filter-status="filterStatus"
      v-model:items-per-page="itemsPerPage"
      :items="serverItems"
      :loading="loading"
      :total-items="totalItems"
      :can-add-product="canAddProduct"
      @new-pr="openNewPR"
      @add-product="openCreateProductDialog"
      @commit-search="commitSearch"
      @clear-search="clearSearch"
      @refresh="refresh"
      @load-items="loadItems"
      @view-detail="openDetail"
      @issue-po="openPurchaseOrder"
    />

    <PurchaseRequisitionListMobile
      v-else
      v-model:search-input="searchInput"
      v-model:filter-status="filterStatus"
      :items="serverItems"
      :loading="loading"
      :page="page"
      :total-items="totalItems"
      :items-per-page="itemsPerPage"
      :can-add-product="canAddProduct"
      @commit-search="commitSearch"
      @clear-search="clearSearch"
      @refresh="refresh"
      @new-pr="openNewPR"
      @add-product="openCreateProductDialog"
      @view-detail="openDetail"
      @issue-po="openPurchaseOrder"
      @change-page="goToPage"
    />

    <!-- New Purchase Requisition -->
    <PurchaseRequisitionDialog
      v-model="showNewPRDialog"
      :prefill-items="prefillItemsForDialog"
      :draft-id="resumeDraftId"
      @submitted="onPRSubmitted"
      @saved-draft="onDraftSaved"
    />

    <PRDraftsDialog
      v-model="showDraftsDialog"
      :drafts="manualDrafts"
      :loading="draftsLoading"
      @resume="onResumeDraft"
      @delete="onDeleteDraft"
    />

    <!-- 3. Add the Modal Component -->
    <IssuePOModal v-model="showPOModal" :pr="selectedPRForPO" @ordered="onPOIssued" />

    <!-- Detail Modal -->
    <PRDetailModal v-if="selectedPR" v-model="showModal" :pr="selectedPR"
    @approve="openConfirm('APPROVE', $event)" @reject="openConfirm('REJECT', $event)"
    @unapprove="handleUnapprove" @update="onPRUpdate" @create-replacement="onPRReplacement"
    @split-save="onPRSplitSave"/>

    <!-- Reorder Requests Dialog -->
    <ReorderRequestsDialog
      v-model="showReorderDialog"
      :reorderRequests="reorderRequests"
      :selectedReorderIds="selectedReorderIds"
      @update:selectedReorderIds="selectedReorderIds = $event"
      @create-pr="createPRFromReorder"
    />

    <!-- Inline Add Product dialog (create-only) -->
    <ProductFormDialog
      v-model="showProductDialog"
      v-model:form="productFormRef"
      :dialog-mode="productDialogMode"
      :product-form="productForm"
      :loading="productLoading"
      :mobile="mobile"
      :rules="productRules"
      :is-edit-restricted="false"
      @submit="handleProductSubmit"
      @close="closeProductDialog"
    />
  </v-container>
</template>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
  width: 100%;
}

/* Small screens / mobile: force 2 columns -> 6 cards = 3 rows x 2 columns */
@media (max-width: 600px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
