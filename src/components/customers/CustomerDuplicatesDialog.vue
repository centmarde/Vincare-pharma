<script setup lang="ts">
import { watch } from 'vue'
import { useDisplay } from 'vuetify'
import CustomerTermsChips from './CustomerTermsChips.vue'
import { useCustomerDuplicates } from '@/composables/useCustomerDuplicates'
import type { DiscountProfile } from '@/stores/discountsData'

// Customers sharing a name, each copy side by side with what tells a duplicate
// from a separate branch: address, channel, terms, and what it has been used for.
const props = defineProps<{
  modelValue: boolean
  department: 'inhouse' | 'ethical'
  profileFor: (customerId: number) => DiscountProfile | null
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  /** A customer was deleted — the page should reload its list. */
  (e: 'changed'): void
}>()

const { mobile } = useDisplay()
const { loading, error, groups, search, page, pageCount, pagedGroups, extraCopies, changed, openView, load, remove } =
  useCustomerDuplicates(props.department)

watch(() => props.modelValue, (isOpen) => { if (isOpen) void openView() }, { immediate: true })
watch(changed, () => emit('changed'))

const channelLabel = (department: string | null) =>
  department === 'inhouse' ? 'In-House' : department === 'ethical' ? 'Ethical' : department === 'pos' ? 'POS' : 'Unassigned'
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    :fullscreen="mobile"
    max-width="1100"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-card-title class="pa-4 pa-sm-5 pb-2 d-flex align-start ga-2 text-wrap">
        <div class="flex-grow-1">
          <div class="text-h6 font-weight-bold">Duplicate customers</div>
          <div class="text-caption text-medium-emphasis">
            Customers with the same name. Compare the copies — a different address is usually a separate branch, not a
            duplicate. A copy with orders, sales or delivery receipts can't be deleted; keep that one.
          </div>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" @click="emit('update:modelValue', false)" />
      </v-card-title>

      <div class="px-4 px-sm-5 pb-3 d-flex align-center flex-wrap ga-3">
        <v-text-field
          v-model="search"
          placeholder="Search a name"
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          clearable
          :style="mobile ? 'width: 100%' : 'max-width: 320px'"
        />
        <span v-if="!loading && !error" class="text-caption text-medium-emphasis">
          {{ groups.length }} names · {{ extraCopies }} extra copies
        </span>
        <v-spacer />
        <v-btn variant="text" size="small" class="text-none" prepend-icon="mdi-refresh" :loading="loading" @click="load">Refresh</v-btn>
      </div>
      <v-divider />

      <v-card-text class="pa-4 pa-sm-5">
        <v-progress-linear v-if="loading" indeterminate class="mb-3" />
        <v-alert v-else-if="error" type="error" variant="tonal" density="compact" class="text-body-2">{{ error }}</v-alert>
        <div v-else-if="!pagedGroups.length" class="text-center text-body-2 text-medium-emphasis py-8">
          {{ search ? 'No duplicate names match that search.' : 'No duplicate customers.' }}
        </div>

        <div v-for="group in pagedGroups" :key="group.key" class="mb-5">
          <div class="text-subtitle-2 font-weight-bold mb-1">
            {{ group.name }} <span class="text-caption text-medium-emphasis">· {{ group.copies.length }} copies</span>
          </div>
          <v-table density="compact" class="border rounded-lg">
            <thead>
              <tr>
                <th class="text-caption">#</th>
                <th class="text-caption">Channel</th>
                <th class="text-caption">Address / area</th>
                <th class="text-caption">Contact · owner</th>
                <th class="text-caption">Terms</th>
                <th class="text-caption">Used</th>
                <th class="text-caption text-right"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="copy in group.copies" :key="copy.customer.id">
                <td class="text-caption text-medium-emphasis">{{ copy.customer.id }}</td>
                <td class="text-caption">{{ channelLabel(copy.customer.department) }}</td>
                <td class="text-caption">
                  {{ copy.customer.address || '—' }}
                  <div v-if="copy.customer.area" class="text-medium-emphasis">{{ copy.customer.area }}</div>
                </td>
                <td class="text-caption">
                  {{ copy.customer.contact_no || '—' }}
                  <div v-if="copy.customer.owner_name" class="text-medium-emphasis">{{ copy.customer.owner_name }}</div>
                </td>
                <td class="text-caption">
                  <CustomerTermsChips :profile="profileFor(copy.customer.id)" />
                  <div v-if="copy.customer.term_days" class="text-medium-emphasis">{{ copy.customer.term_days }}</div>
                </td>
                <td class="text-caption">
                  <template v-if="copy.usage.documents || copy.usage.deliveryReceipts">
                    {{ copy.usage.documents }} order/sale<template v-if="copy.usage.deliveryReceipts"> · {{ copy.usage.deliveryReceipts }} DR</template>
                  </template>
                  <span v-else class="text-medium-emphasis">never</span>
                </td>
                <td class="text-right text-no-wrap">
                  <v-btn
                    v-if="!copy.blockedReason"
                    size="small"
                    variant="tonal"
                    color="error"
                    class="text-none"
                    prepend-icon="mdi-delete-outline"
                    @click="remove(copy)"
                  >
                    Delete
                  </v-btn>
                  <span v-else class="text-caption text-medium-emphasis">{{ copy.blockedReason }}</span>
                </td>
              </tr>
            </tbody>
          </v-table>
        </div>

        <div v-if="pageCount > 1" class="d-flex justify-center mt-2">
          <v-pagination v-model="page" :length="pageCount" :total-visible="mobile ? 3 : 7" density="compact" />
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
