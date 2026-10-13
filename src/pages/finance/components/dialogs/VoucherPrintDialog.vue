<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useToast } from 'vue-toastification'
import type { VoucherType } from '@/stores/disbursementVouchersData'
import VoucherSheet from './VoucherSheet.vue'
import { useExpenseAccounts } from '../../composables/useExpenseAccounts'
import { useVoucherPdf } from '../../composables/useVoucherPdf'
import { standardVoucherRows } from '../../composables/useVoucherForm'
import { companyOptions, defaultCompanyFor } from '@/utils/companyProfiles'
import type { CompanyKey } from '@/utils/companyProfiles'

// The dialog around the printed voucher: which company letterhead, the reprint
// chip, and the download button. The sheet itself is VoucherSheet.vue and the
// capture is useVoucherPdf — split out when this component passed 500 lines.

const props = defineProps<{
  modelValue: boolean
  voucher: VoucherType | null
  /** 1 = the original. Anything higher is a reprint and is marked as such. */
  copyNo: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  /** A PDF was actually produced — only now is a copy really spent. */
  (e: 'printed'): void
}>()

const toast = useToast()
const { allAccounts, ensureLoaded: ensureAccountsLoaded } = useExpenseAccounts()
const { generate } = useVoucherPdf()

// A voucher can be printed straight from the list without the form having been
// opened, so the chart may not be loaded yet. Without this the ACCOUNT NAME
// column would print bare codes.
watch(() => props.modelValue, (open) => { if (open) void ensureAccountsLoaded() }, { immediate: true })

// Same legal entity as the POS receipt / Ethical invoice / Delivery Receipt /
// SOA — Exelmed is VinCare's printed-document letterhead regardless of module.
// This replaces the source form's Barangay / City / Province block, which is
// LGU-specific and has no meaning for a private distributor.
const companyKey = ref<CompanyKey>(defaultCompanyFor('disbursement_voucher'))

const isReprint = computed(() => props.copyNo > 1)

// More accounts than the standard form prints longer: every row past the fifth
// pushes the signature row down, so the RECORDED stamp needs adjusting for this
// voucher. Not a refusal any more — staff asked to print these and to handle
// the stamp themselves — just said up front. Never truncated.
const isLongVoucher = computed(
  () => (props.voucher?.items.length ?? 0) > standardVoucherRows,
)

const sheet = ref<InstanceType<typeof VoucherSheet> | null>(null)

async function handlePrint() {
  // The ACCOUNT NAME column resolves each line's code through the chart. If the
  // chart is not loaded the column prints bare codes ("7050" instead of "Fuel &
  // Lubricant Expense") — and a PDF is handed over or filed, so there is no
  // second chance to notice. The open-watcher above starts the load; this makes
  // sure it finished before anything is captured.
  await ensureAccountsLoaded()
  // Checked against the FULL chart, not the active one: a historical voucher's
  // accounts may all have been retired since, and their names still resolve
  // from allAccounts. Requiring an active account would block printing exactly
  // the old vouchers most likely to need reprinting.
  if (!allAccounts.value.length) {
    toast.error('Could not load the chart of accounts. The voucher was not printed.')
    return
  }

  await nextTick()
  const element = sheet.value?.root
  if (!element || !props.voucher) return

  const filename = `${props.voucher.dv_no ?? 'disbursement-voucher'}`
    + `${isReprint.value ? `-reprint-${props.copyNo}` : ''}.pdf`
  await generate(element, filename)

  // Stamp AFTER the file exists. Opening this dialog used to burn a copy
  // number and lock the draft, so a glance at a voucher changed it.
  emit('printed')

  toast.success(isReprint.value ? `Reprint (copy ${props.copyNo}) generated.` : 'Disbursement voucher generated.')
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="900"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <div v-if="!voucher" class="pa-6 text-center text-caption text-medium-emphasis">
        Voucher not found.
      </div>

      <template v-else>
        <v-card-text class="pa-6">
          <v-alert
            v-if="isLongVoucher"
            type="info"
            variant="tonal"
            density="compact"
            class="mb-4 text-body-2"
          >
            This voucher has {{ voucher.items.length }} accounts, more than the standard
            {{ standardVoucherRows }}, so it prints longer than the usual form. Adjust the
            RECORDED stamp position when marking it.
          </v-alert>
          <VoucherSheet ref="sheet" :voucher="voucher" :copy-no="copyNo" :company-key="companyKey" />
        </v-card-text>

        <v-divider />

        <v-card-actions class="pa-4">
          <v-select
            v-model="companyKey"
            :items="companyOptions"
            label="Issuing company"
            variant="outlined"
            density="compact"
            hide-details
            class="flex-grow-0 mr-3"
            style="max-width: 230px"
          />
          <v-chip v-if="isReprint" color="warning" variant="tonal" size="small" label>
            REPRINT — COPY NO. {{ copyNo }}
          </v-chip>
          <v-chip v-else color="info" variant="tonal" size="small" label>ORIGINAL COPY</v-chip>
          <v-spacer />
          <v-btn variant="text" class="text-none" @click="emit('update:modelValue', false)">Close</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            class="text-none font-weight-bold"
            prepend-icon="mdi-printer"
            @click="handlePrint"
          >
            Download PDF
          </v-btn>
        </v-card-actions>
      </template>
    </v-card>
  </v-dialog>
</template>
