<script setup lang="ts">
import CustomerTermsChips from '@/components/customers/CustomerTermsChips.vue'

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
  delete: [item: any]
}>()

const notSet = (label: string) => `No ${label} set`

const onPageChange = (value: number) => {
  emit('update:page', value)
}
</script>

<template>
  <div>
    <v-progress-linear v-if="loading" indeterminate color="primary" />

    <v-list class="pa-2" lines="two">
      <v-card
        v-for="item in customers"
        :key="item.id"
        variant="outlined"
        rounded="lg"
        class="mb-2 pa-3"
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

              <div class="d-flex align-center ga-1">
                <v-btn
                  size="x-small"
                  variant="text"
                  color="primary"
                  icon="mdi-pencil-outline"
                  @click="emit('edit', item)"
                />
                <v-btn
                  size="x-small"
                  variant="text"
                  color="error"
                  icon="mdi-delete-outline"
                  @click="emit('delete', item)"
                />
              </div>
            </div>

            <div class="d-flex flex-wrap ga-1 mt-1">
              <v-chip v-if="item.agency_type" size="x-small" variant="tonal">
                {{ item.agency_type }}
              </v-chip>

              <v-chip
                size="x-small"
                variant="tonal"
                :color="item.is_active ? 'success' : 'grey'"
              >
                {{ item.is_active ? 'Active' : 'Inactive' }}
              </v-chip>

              <v-chip v-if="item.agent_name" size="x-small" variant="tonal">
                {{ item.agent_name }}
              </v-chip>
            </div>

            <div v-if="profileFor" class="mt-2">
              <CustomerTermsChips :profile="profileFor(item.id)" />
            </div>

            <div class="text-caption text-medium-emphasis mt-2">
              <div class="d-flex align-center ga-1">
                <v-icon size="12" icon="mdi-phone-outline" />

                <span :class="{ 'font-italic': !item.contact_no }">
                  {{ item.contact_no || notSet('contact number') }}
                </span>
              </div>

              <div class="d-flex align-center ga-1 mt-1">
                <v-icon size="12" icon="mdi-map-marker-outline" />

                <span :class="{ 'font-italic': !item.area }">
                  {{ item.area || notSet('area') }}
                </span>
              </div>

              <div class="d-flex align-center ga-1 mt-1">
                <v-icon size="12" icon="mdi-calendar-clock-outline" />

                <span :class="{ 'font-italic': !item.term_days }">
                  {{ item.term_days || notSet('payment terms') }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </v-card>
    </v-list>

    <v-divider />

    <div class="d-flex justify-center pa-3">
      <v-pagination
        :model-value="page"
        :length="Math.ceil(totalCount / pageSize) || 1"
        density="comfortable"
        :total-visible="5"
        @update:model-value="onPageChange"
      />
    </div>
  </div>
</template>