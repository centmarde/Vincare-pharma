<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { usePurchaseRequisitionStore } from '@/stores/purchaseRequisition'
import { useAuthUserStore } from '@/stores/authUser'
import { formatCurrency } from '@/utils/helpers'

const purchaseRequisitionStore = usePurchaseRequisitionStore()
const authUserStore = useAuthUserStore()

// Use canViewValuation from authUser store (role_id 1 or 2)
const { canViewValuation } = authUserStore

// Search and filter state
const searchQuery = ref('')
const itemsPerPage = ref(10)
const page = ref(1)
const sortBy = ref([{ key: 'created_at', order: 'desc' as 'asc' | 'desc' }])

// Expanded rows state - store expanded item keys
const expanded = ref<string[]>([])

// Headers for the data table
const headers = computed(() => [
  { title: '', key: 'data-table-expand', sortable: false },
  { title: 'SKU', key: 'SKU', sortable: true },
  { title: 'Name', key: 'name', sortable: true },
  { title: 'Quantity', key: 'quantity', sortable: true },
  { title: 'Unit Cost', key: 'unit_cost', sortable: true },
  { title: 'PR Number', key: 'pr_number', sortable: true },
])

// Computed properties
const loading = computed(() => purchaseRequisitionStore.loading)

// Map purchase requisition items to product-like format (only approved PRs)
const products = computed(() => {
  const prs = purchaseRequisitionStore.prs
  const allItems: any[] = []

  prs
    .filter((pr) => pr.status === 'approved')
    .forEach((pr) => {
      pr.items.forEach((item) => {
        allItems.push({
          SKU: item.SKU,
          name: item.item_description,
          quantity: item.qty,
          unit_cost: item.cost_per_unit,
          pr_number: pr.pr_number,
          // Additional PR-related info
          id: item.id,
          requisition_id: pr.id,
          unit: item.unit,
          offer_per_unit: item.offer_per_unit,
          no: item.no,
          // New fields
          cost_price: item.cost_price,
          sell_price: item.sell_price,
          val_cost: item.val_cost,
          val_sell: item.val_sell,
          total_sold: item.total_sold,
          transfered: item.transfered,
          adjusted: item.adjusted,
          expiry_date: item.expiry_date,
          reorder_pt: item.reorder_pt,
          supplier_name: '',
        })
      })
    })

  // Apply search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    return allItems.filter(
      (item) =>
        item.name.toLowerCase().includes(query) || item.pr_number.toLowerCase().includes(query),
    )
  }

  return allItems
})

const totalProducts = computed(() => products.value.length)

// Methods
const handleSearch = () => {
  fetchProducts()
}

const fetchProducts = async () => {
  // Fetch purchase requisition items as products
  await purchaseRequisitionStore.fetchPurchaseRequisition()
}

// Lifecycle
onMounted(() => {
  fetchProducts()
})
</script>

<template>
  <v-card>
    <v-card-title class="d-flex align-center flex-wrap ga-3">
      <v-icon icon="mdi-package-variant" class="mr-2" color="primary"></v-icon>
      <span class="text-h5 font-weight-bold">Purchase Requisition Items</span>
      <v-spacer></v-spacer>
      <v-text-field
        v-model="searchQuery"
        label="Search items..."
        prepend-inner-icon="mdi-magnify"
        variant="outlined"
        density="comfortable"
        hide-details
        class="max-width-300"
        @keyup.enter="handleSearch"
      ></v-text-field>
    </v-card-title>

    <v-divider></v-divider>

    <v-card-text class="pa-0">
      <v-data-table-server
        v-model:items-per-page="itemsPerPage"
        v-model:page="page"
        v-model:sort-by="sortBy"
        v-model:expanded="expanded"
        :headers="headers"
        :items="products"
        :items-length="totalProducts"
        :loading="loading"
        loading-text="Loading products..."
        hover
        density="comfortable"
        show-expand
        @update:options="fetchProducts"
      >
        <template #[`item.unit_cost`]="{ value }">
          <span v-if="value != null">{{ formatCurrency(Number(value)) }}</span>
          <span v-else class="text-grey">-</span>
        </template>

        <template #[`item.quantity`]="{ value }">
          <v-chip
            :color="value && value > 10 ? 'success' : value && value > 0 ? 'warning' : 'error'"
            size="small"
            variant="outlined"
          >
            {{ value ?? 0 }}
          </v-chip>
        </template>

        <template #[`expanded-row`]="{ item }">
          <tr>
            <td :colspan="headers.length" class="pa-0 border-0">
              <div class="pa-4">
                <v-row class="ma-0">
                  <!-- Row 1 -->
                  <v-col cols="12" md="3" class="d-flex align-center py-2">
                    <v-icon icon="mdi-numeric" color="primary" class="mr-3"></v-icon>
                    <div>
                      <div class="text-caption text-grey-darken-1">Item No.</div>
                      <div class="text-body-1 font-weight-medium">{{ item.no ?? 'N/A' }}</div>
                    </div>
                  </v-col>
                  <v-col cols="12" md="3" class="d-flex align-center py-2">
                    <v-icon icon="mdi-scale-balance" color="primary" class="mr-3"></v-icon>
                    <div>
                      <div class="text-caption text-grey-darken-1">Unit</div>
                      <div class="text-body-1 font-weight-medium">{{ item.unit ?? 'N/A' }}</div>
                    </div>
                  </v-col>
                  <!-- Row 1 -->
                  <template v-if="canViewValuation">
                    <v-col cols="12" md="3" class="d-flex align-center py-2">
                      <v-icon icon="mdi-currency-php" color="primary" class="mr-3"></v-icon>
                      <div>
                        <div class="text-caption text-grey-darken-1">Cost Price</div>
                        <div class="text-body-1 font-weight-medium">
                          {{
                            item.cost_price != null ? formatCurrency(Number(item.cost_price)) : 'N/A'
                          }}
                        </div>
                      </div>
                    </v-col>
                  </template>
                  <v-col cols="12" md="3" class="d-flex align-center py-2">
                    <v-icon icon="mdi-tag" color="primary" class="mr-3"></v-icon>
                    <div>
                      <div class="text-caption text-grey-darken-1">Sell Price</div>
                      <div class="text-body-1 font-weight-medium">
                        {{
                          item.sell_price != null ? formatCurrency(Number(item.sell_price)) : 'N/A'
                        }}
                      </div>
                    </div>
                  </v-col>
                  <template v-if="canViewValuation">
                  <v-col cols="12" md="3" class="d-flex align-center py-2">
                    <v-icon icon="mdi-store" color="primary" class="mr-3"></v-icon>
                    <div>
                      <div class="text-caption text-grey-darken-1">Supplier</div>
                      <div class="text-body-1 font-weight-medium">
                        {{ item.supplier_name || 'N/A' }}
                      </div>
                    </div>
                  </v-col>
                  </template>
                  <!-- Row 2 -->
                  <template v-if="canViewValuation">
                    <v-col cols="12" md="3" class="d-flex align-center py-2">
                      <v-icon icon="mdi-wallet" color="primary" class="mr-3"></v-icon>
                      <div>
                        <div class="text-caption text-grey-darken-1">Val Cost</div>
                        <div class="text-body-1 font-weight-medium">
                          {{ item.val_cost != null ? formatCurrency(Number(item.val_cost)) : 'N/A' }}
                        </div>
                      </div>
                    </v-col>
                    <v-col cols="12" md="3" class="d-flex align-center py-2">
                      <v-icon icon="mdi-cash" color="primary" class="mr-3"></v-icon>
                      <div>
                        <div class="text-caption text-grey-darken-1">Val Sell</div>
                        <div class="text-body-1 font-weight-medium">
                          {{ item.val_sell != null ? formatCurrency(Number(item.val_sell)) : 'N/A' }}
                        </div>
                      </div>
                    </v-col>
                  </template>
                  <v-col cols="12" md="3" class="d-flex align-center py-2">
                    <v-icon icon="mdi-package-variant-closed" color="primary" class="mr-3"></v-icon>
                    <div>
                      <div class="text-caption text-grey-darken-1">Total Sold</div>
                      <div class="text-body-1 font-weight-medium">
                        {{ item.total_sold ?? 'N/A' }}
                      </div>
                    </div>
                  </v-col>
                  <v-col cols="12" md="3" class="d-flex align-center py-2">
                    <v-icon icon="mdi-truck-delivery" color="primary" class="mr-3"></v-icon>
                    <div>
                      <div class="text-caption text-grey-darken-1">Transferred</div>
                      <div class="text-body-1 font-weight-medium">
                        {{ item.transfered ?? 'N/A' }}
                      </div>
                    </div>
                  </v-col>
                  <!-- Row 3 -->
                  <v-col cols="12" md="3" class="d-flex align-center py-2">
                    <v-icon icon="mdi-arrow-left-right" color="primary" class="mr-3"></v-icon>
                    <div>
                      <div class="text-caption text-grey-darken-1">Adjusted</div>
                      <div class="text-body-1 font-weight-medium">{{ item.adjusted ?? 'N/A' }}</div>
                    </div>
                  </v-col>
                  <v-col cols="12" md="3" class="d-flex align-center py-2">
                    <v-icon icon="mdi-calendar-clock" color="primary" class="mr-3"></v-icon>
                    <div>
                      <div class="text-caption text-grey-darken-1">Expiry Date</div>
                      <div class="text-body-1 font-weight-medium">
                        {{
                          item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : 'N/A'
                        }}
                      </div>
                    </div>
                  </v-col>
                  <v-col cols="12" md="3" class="d-flex align-center py-2">
                    <v-icon icon="mdi-alert-circle" color="primary" class="mr-3"></v-icon>
                    <div>
                      <div class="text-caption text-grey-darken-1">Reorder Point</div>
                      <div class="text-body-1 font-weight-medium">
                        {{ item.reorder_pt ?? 'N/A' }}
                      </div>
                    </div>
                  </v-col>
                </v-row>
              </div>
            </td>
          </tr>
        </template>

        <template #[`no-data`]>
          <div class="text-center py-8">
            <v-icon icon="mdi-package-variant-closed" size="48" color="grey"></v-icon>
            <p class="text-grey mt-2">No products found</p>
          </div>
        </template>
      </v-data-table-server>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.max-width-300 {
  max-width: 300px;
}
</style>