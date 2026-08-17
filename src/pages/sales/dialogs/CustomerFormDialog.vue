<script setup lang="ts">
import type { CreateCustomerData } from '@/stores/customersData'
import CustomerTradeProfileFields from '@/components/customers/CustomerTradeProfileFields.vue'

interface Props {
  modelValue: boolean
  mobile: boolean
  editingId: number | null
  form: CreateCustomerData
  rules: Record<string, (value: unknown) => boolean | string>
  loading: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'update:form': [value: CreateCustomerData]
  cancel: []
  submit: []
}>()
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    :fullscreen="mobile"
    :max-width="mobile ? undefined : 640"
    :transition="mobile ? 'dialog-bottom-transition' : undefined"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card :rounded="mobile ? '0' : 'lg'">
      <v-toolbar v-if="mobile" color="surface" density="comfortable">
        <v-btn icon="mdi-close" @click="emit('cancel')" />

        <v-toolbar-title class="text-body-1 font-weight-bold">
          {{ editingId ? 'Edit Customer' : 'Add Customer' }}
        </v-toolbar-title>

        <v-btn
          variant="flat"
          color="primary"
          class="text-none mr-2"
          :loading="loading"
          @click="emit('submit')"
        >
          {{ editingId ? 'Save' : 'Create' }}
        </v-btn>
      </v-toolbar>

      <v-card-title v-else class="pa-4 pa-sm-5 d-flex align-center ga-2">
        <v-icon
          :icon="editingId ? 'mdi-account-edit-outline' : 'mdi-account-plus-outline'"
          color="primary"
        />

        <span class="text-h6 font-weight-bold">
          {{ editingId ? 'Edit Customer' : 'Add Customer' }}
        </span>
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-4 pa-sm-5">
        <v-text-field
          v-model="form.name"
          label="Name *"
          :rules="[rules.required]"
          variant="outlined"
          density="compact"
          class="mb-3"
          prepend-inner-icon="mdi-account-outline"
        />

        <v-row dense>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="form.contact_person"
              label="Contact person"
              variant="outlined"
              density="compact"
              class="mb-3"
              hide-details
              prepend-inner-icon="mdi-account-tie-outline"
            />
          </v-col>

          <v-col cols="12" sm="6">
            <v-text-field
              v-model="form.contact_no"
              label="Contact no."
              variant="outlined"
              density="compact"
              class="mb-3"
              hide-details
              prepend-inner-icon="mdi-phone-outline"
            />
          </v-col>
        </v-row>

        <v-row dense>
          <v-col cols="12" sm="6">
            <v-text-field
              v-model="form.email"
              label="Email"
              variant="outlined"
              density="compact"
              class="mb-3"
              hide-details
              prepend-inner-icon="mdi-email-outline"
            />
          </v-col>

          <v-col cols="12" sm="6">
            <v-text-field
              v-model="form.area"
              label="Area"
              variant="outlined"
              density="compact"
              class="mb-3"
              hide-details
              prepend-inner-icon="mdi-map-marker-outline"
            />
          </v-col>
        </v-row>

        <!-- Deactivating hides a customer from the POS customer picker without
             deleting them or their sales history. -->
        <div class="text-subtitle-2 font-weight-bold mt-2 mb-1">Trade / Rebate Profile</div>
        <v-divider class="mb-3" />

        <!-- Rebate PAYOUT settings are hidden here: a rebate is an Ethical
             construct with its own approval + payout workflow, so a walk-in POS
             buyer has no use for a payout mode. The rates themselves stay, since
             a regular POS customer can legitimately have a discount or markup. -->
        <CustomerTradeProfileFields :form="form" :show-rebate-payout="false" />

        <v-switch
          v-model="form.is_active"
          :label="form.is_active ? 'Active' : 'Inactive — hidden from the POS picker'"
          color="primary"
          density="compact"
          hide-details
          class="mb-3"
        />

        <v-textarea
          v-model="form.address"
          label="Address"
          variant="outlined"
          density="compact"
          rows="2"
          class="mb-3"
          hide-details
          prepend-inner-icon="mdi-home-outline"
        />

        <v-text-field
          v-model="form.category"
          label="Category"
          placeholder="e.g. DRUGSTORE, PRIVATE HOSPITAL"
          variant="outlined"
          density="compact"
          class="mb-3"
          hide-details
          prepend-inner-icon="mdi-shape-outline"
        />

        <v-text-field
          v-model="form.term_days"
          label="Payment terms"
          placeholder="e.g. 60 Days, COD, Consignment"
          hint="A leading number sets the due date; without one the receivable cannot be aged."
          persistent-hint
          variant="outlined"
          density="compact"
          prepend-inner-icon="mdi-calendar-clock-outline"
        />
      </v-card-text>

      <template v-if="!mobile">
        <v-divider />

        <v-card-actions class="pa-4">
          <v-spacer />

          <v-btn variant="text" class="text-none" @click="emit('cancel')"> Cancel </v-btn>

          <v-btn
            color="primary"
            variant="flat"
            class="text-none px-6"
            :loading="loading"
            @click="emit('submit')"
          >
            {{ editingId ? 'Save changes' : 'Create customer' }}
          </v-btn>
        </v-card-actions>
      </template>
    </v-card>
  </v-dialog>
</template>