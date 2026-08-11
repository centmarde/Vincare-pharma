<script setup lang="ts">
import CustomerTermsChips from '@/components/customers/CustomerTermsChips.vue'
import { businessStructures } from '../composables/useCustomers'

interface Props {
  customers: any[]
  totalCount: number
  page: number
  pageSize: number
  loading: boolean
  profileFor: (id: number | null | undefined) => any
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:page': [value: number]
  edit: [item: any]
}>()

function structureLabel(value: string | null): string {
  return (
    businessStructures.find((structure) => structure.value === value)?.title ??
    'not set yet'
  )
}

const notSet = (field: string) => `No ${field} set`

const onPageChange = (value: number) => {
  emit('update:page', value)
}
</script>

<template>
  <div>
    <v-progress-linear v-if="loading" indeterminate color="primary" />

    <div class="pa-2">
      <v-card
        v-for="item in customers"
        :key="item.id"
        variant="outlined"
        rounded="lg"
        class="mb-2 pa-3"
        @click="emit('edit', item)"
      >
        <div class="d-flex align-start ga-3">
          <v-avatar size="36" color="primary" variant="tonal">
            <span class="text-body-2 font-weight-bold">
              {{ (item.name || '?').charAt(0).toUpperCase() }}
            </span>
          </v-avatar>

          <div class="flex-grow-1" style="min-width: 0">
            <div class="d-flex align-center justify-space-between ga-2">
              <span class="font-weight-medium text-body-2 text-truncate">
                {{ item.name || notSet('name') }}
              </span>
            </div>

            <div class="d-flex flex-wrap ga-1 mt-1">
              <v-chip
                size="x-small"
                variant="tonal"
                :color="item.agency_type ? 'primary' : 'grey'"
              >
                {{
                  item.agency_type
                    ? item.agency_type.toUpperCase()
                    : 'Unassigned'
                }}
              </v-chip>

              <v-chip
                v-if="item.business_structure"
                size="x-small"
                variant="tonal"
              >
                {{ structureLabel(item.business_structure) }}
              </v-chip>

              <v-chip
                v-if="item.area"
                size="x-small"
                variant="tonal"
                color="teal"
              >
                {{ item.area }}
              </v-chip>

              <v-chip
                size="x-small"
                variant="tonal"
                :color="item.is_vat_registered ? 'primary' : 'grey'"
              >
                {{ item.is_vat_registered ? 'VAT' : 'Non-VAT' }}
              </v-chip>

              <v-chip
                size="x-small"
                variant="tonal"
                :color="item.is_active ? 'success' : 'grey'"
              >
                {{ item.is_active ? 'Active' : 'Inactive' }}
              </v-chip>
            </div>

            <div class="mt-2" @click.stop>
              <CustomerTermsChips :profile="profileFor(item.id)" />
            </div>

            <div class="text-caption text-medium-emphasis mt-2">
              <div class="d-flex align-center ga-1">
                <v-icon size="12" icon="mdi-phone-outline" />

                <span
                  :class="{
                    'font-italic': !item.contact_no,
                  }"
                >
                  {{ item.contact_no || notSet('contact number') }}
                </span>
              </div>

              <div class="d-flex align-center ga-1 mt-1">
                <v-icon size="12" icon="mdi-account-tie-outline" />

                <span
                  :class="{
                    'font-italic': !item.contact_person,
                  }"
                >
                  {{ item.contact_person || notSet('contact person') }}
                </span>
              </div>

              <div class="d-flex align-center ga-1 mt-1">
                <v-icon size="12" icon="mdi-card-account-details-outline" />

                <span
                  :class="{
                    'font-italic': !item.tin_number,
                  }"
                >
                  {{ item.tin_number || notSet('TIN') }}
                </span>
              </div>

              <div class="d-flex align-center ga-1 mt-1">
                <v-icon size="12" icon="mdi-calendar-clock-outline" />

                <span
                  :class="{
                    'font-italic': !item.term_days,
                  }"
                >
                  {{ item.term_days || notSet('payment terms') }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </v-card>
    </div>

    <v-divider />

    <div class="d-flex justify-center pa-3">
      <v-pagination
        :model-value="page"
        :length="Math.ceil(totalCount / pageSize) || 1"
        density="comfortable"
        :total-visible="3"
        @update:model-value="onPageChange"
      />
    </div>
  </div>
</template>