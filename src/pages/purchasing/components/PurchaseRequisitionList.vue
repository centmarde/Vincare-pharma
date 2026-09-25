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
import { ref, onMounted, watch } from 'vue'
import { useDisplay } from 'vuetify'

const prStore = usePurchaseRequisitionStore()

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
async function onPRUpdate(data: { items: any[]; remarks: string }) {
  if (!selectedPR.value) return
  const success = await prStore.updatePR({
    prId: selectedPR.value.id,
    items: data.items,
    remarks: data.remarks,
  })
  if (success) {
    showModal.value = false
    loadItems({ page: page.value, itemsPerPage: itemsPerPage.value, sortBy: [] })
  }
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
      @new-pr="openNewPR"
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
      @commit-search="commitSearch"
      @clear-search="clearSearch"
      @refresh="refresh"
      @new-pr="openNewPR"
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
    @unapprove="handleUnapprove" @update="onPRUpdate"/>

    <!-- Reorder Requests Dialog -->
    <ReorderRequestsDialog
      v-model="showReorderDialog"
      :reorderRequests="reorderRequests"
      :selectedReorderIds="selectedReorderIds"
      @update:selectedReorderIds="selectedReorderIds = $event"
      @create-pr="createPRFromReorder"
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
