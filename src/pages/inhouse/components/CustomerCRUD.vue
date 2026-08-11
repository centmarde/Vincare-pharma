<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useCustomers, headers, agencyTypes, businessStructures } from '../composables/useCustomers'
import CustomerTermsCard from '@/components/customers/CustomerTermsCard.vue'
import CustomerTermsChips from '@/components/customers/CustomerTermsChips.vue'
import FieldValue from '@/components/customers/FieldValue.vue'
import CustomerDetailPanel from '@/components/customers/CustomerDetailPanel.vue'
import { label } from '@/utils/helpers'

const {
  customers, loading, search, filtered, showAll, profileFor,
  showForm, editingId, form, rules,
  openCreate, openEdit, submit, remove, init,
} = useCustomers()

// The terms card reads the stored row, not the edit form — these are the
// recorded narrative (price_offered / receipt_details), not editable fields.
const editingCustomer = computed(() =>
  editingId.value == null ? null : customers.value.find((c) => c.id === editingId.value) ?? null)

const formRef = ref()



async function onSubmit() {
  const { valid } = await formRef.value.validate()
  if (!valid) return
  await submit()
}

onMounted(init)
</script>

<template>
  <v-container fluid class="pa-2 fill-height align-start">
    <v-card class="mx-auto w-100"  rounded="lg" elevation="1">
      <v-card-title class="d-flex justify-space-between align-center pa-5 flex-wrap" style="gap:12px">
        <span class="text-h6 font-weight-bold">Customers (Government / LGU)</span>
        <div class="d-flex align-center flex-wrap" style="gap:12px">
          <v-text-field v-model="search" placeholder="Search..." prepend-inner-icon="mdi-magnify"
            variant="outlined" density="compact" hide-details style="min-width:220px" />
          <!-- Unassigned customers already show here; this widens it to every
               channel for when an account is stamped to POS or Ethical. -->
          <v-switch v-model="showAll" label="Show every channel" color="primary"
            density="compact" hide-details inset />
          <v-btn color="primary" class="text-none font-weight-bold" elevation="0" prepend-icon="mdi-plus" @click="openCreate">
            New Customer
          </v-btn>
        </div>
      </v-card-title>
      <v-divider />

      <v-data-table
        :headers="headers" :items="filtered" :loading="loading"
        no-data-text="No customers yet." hover
        density="compact" :items-per-page="25" class="text-no-wrap"
        show-expand item-value="id"
      >
        <template #item.name="{ item }">
          <span class="text-body-2 font-weight-medium">{{ label(item.name) }}</span>
        </template>
        <template #item.agency_type="{ item }">
          <v-chip size="small" variant="tonal" :class="{ 'text-lowercase': !item.agency_type }" class="text-uppercase">
            {{ label(item.agency_type) }}
          </v-chip>
        </template>
        <template #item.contact_no="{ item }">
          <FieldValue :value="item.contact_no" />
        </template>
        <template #item.area="{ item }">
          <FieldValue :value="item.area" />
        </template>
        <template #item.term_days="{ item }">
          <FieldValue :value="item.term_days" />
        </template>
        <template #item.rates="{ item }">
          <CustomerTermsChips :profile="profileFor(item.id)" />
        </template>
        <template #item.is_active="{ item }">
          <v-icon :color="item.is_active ? 'success' : 'grey'">
            {{ item.is_active ? 'mdi-check-circle' : 'mdi-minus-circle' }}
          </v-icon>
        </template>
        <!-- Everything that doesn't earn a column lives one click away. -->
        <template #expanded-row="{ columns, item }">
          <tr>
            <td :colspan="columns.length" class="pa-0">
              <CustomerDetailPanel :customer="item" :profile="profileFor(item.id)" />
            </td>
          </tr>
        </template>
        <template #item.actions="{ item }">
          <v-btn variant="text" size="small" color="primary" class="text-none" @click="openEdit(item)">Edit</v-btn>
          <v-btn variant="text" size="small" color="error" class="text-none" @click="remove(item)">Delete</v-btn>
        </template>
      </v-data-table>
    </v-card>

    <v-dialog v-model="showForm" max-width="520" persistent>
      <v-card rounded="lg">
        <v-card-title class="pa-4 pa-sm-5 pb-2 text-h6 font-weight-bold">
          {{ editingId ? 'Edit' : 'New' }} Customer
        </v-card-title>
        <v-divider />
        <v-card-text class="pa-4 pa-sm-5">
          <v-form ref="formRef">
            <CustomerTermsCard
              v-if="editingCustomer"
              :customer="editingCustomer"
              :profile="profileFor(editingCustomer.id)"
              class="mb-3"
            />
            <v-text-field v-model="form.name" label="Name *" :rules="[rules.required]" variant="outlined" density="compact" class="mb-2" />
            <v-select v-model="form.agency_type" :items="agencyTypes" label="Type" variant="outlined" density="compact" class="mb-2" hide-details />
            <v-text-field v-model="form.contact_person" label="Contact person" variant="outlined" density="compact" class="mb-2" hide-details />
            <v-text-field v-model="form.contact_no" label="Contact no." variant="outlined" density="compact" class="mb-2" hide-details />
            <v-text-field v-model="form.email" label="Email" variant="outlined" density="compact" class="mb-2" hide-details />
            <v-textarea v-model="form.address" label="Address" variant="outlined" density="compact" rows="2" class="mb-2" hide-details />
            <v-text-field
              v-model="form.area"
              label="Area"
              hint="Sales area — a column on the Statement of Accounts register"
              persistent-hint
              variant="outlined"
              density="compact"
              class="mb-2"
            />
            <v-text-field
              v-model="form.term_days"
              label="Payment terms"
              placeholder="e.g. 60 Days, COD, Consignment"
              hint="Payment terms from delivery. A leading number sets the due date; without one the receivable cannot be aged."
              persistent-hint
              variant="outlined"
              density="compact"
              class="mb-2"
            />
            <v-text-field
              v-model="form.tin_number"
              label="TIN"
              hint="BIR Tax Identification Number, e.g. 123-456-789-000"
              persistent-hint
              variant="outlined"
              density="compact"
              class="mb-2"
            />
            <v-radio-group v-model="form.is_vat_registered" label="VAT classification" inline hide-details class="mt-1 mb-2">
              <v-radio label="VAT-registered" :value="true" />
              <v-radio label="Non-VAT" :value="false" />
            </v-radio-group>

            <v-select
              v-model="form.business_structure"
              :items="businessStructures"
              label="Business Structure"
              variant="outlined"
              density="compact"
              class="mb-2"
              hide-details
            />
            <v-text-field
              v-if="form.business_structure === 'corporation' || form.business_structure === 'partnership'"
              v-model="form.sec_registration_no"
              label="SEC Registration No. *"
              hint="Securities and Exchange Commission registration number"
              persistent-hint
              :rules="[rules.requiredIfSec]"
              variant="outlined"
              density="compact"
              class="mb-2"
            />
            <v-text-field
              v-if="form.business_structure === 'sole_proprietorship'"
              v-model="form.dti_registration_no"
              label="DTI Registration No. *"
              hint="DTI Certificate of Business Name Registration number"
              persistent-hint
              :rules="[rules.requiredIfDti]"
              variant="outlined"
              density="compact"
              class="mb-2"
            />
          </v-form>
        </v-card-text>
        <v-divider />
        <v-card-actions class="pa-4 justify-end" style="gap:8px">
          <v-btn variant="outlined" class="text-none" @click="showForm = false">Cancel</v-btn>
          <v-btn color="primary" class="text-none font-weight-bold" elevation="0" :loading="loading" @click="onSubmit">Save</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
:deep(.v-data-table thead th) { background:#f5f5f5 !important; font-weight:700 !important; font-size:.75rem !important; color:#616161 !important; }
</style>
