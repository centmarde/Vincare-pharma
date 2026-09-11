<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import html2pdf from 'html2pdf.js'
import { useToast } from 'vue-toastification'
import StatementBody from '../StatementBody.vue'
import type { StatementRow } from '../../composables/useIncomeStatement'
import type { CashBasisStatement, MonthlyCashBasisStatement, MonthlyIncomeStatement } from '@/stores/glData'
import { companyFor, companyOptions, defaultCompanyFor } from '@/utils/companyProfiles'
import type { CompanyKey } from '@/utils/companyProfiles'

const props = defineProps<{
  modelValue: boolean
  title: string
  periodLine: string
  basisLine: string
  isCash: boolean
  isMonthly: boolean
  periodRows: StatementRow[]
  monthlyRows: StatementRow[]
  monthly: MonthlyIncomeStatement | null
  cashStatement: CashBasisStatement | null
  monthlyCash: MonthlyCashBasisStatement | null
  monthLabel: (month: string) => string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const toast = useToast()
const printArea = ref<HTMLElement | null>(null)

// Which entity issues the statement. Only asked here: the on-screen view has no
// letterhead, but the page that leaves the building has to say who produced it.
const companyKey = ref<CompanyKey>(defaultCompanyFor('statement_of_account'))
const company = computed(() => companyFor(companyKey.value))

// A month-column statement does not fit portrait — 13 columns on A4 portrait
// leaves ~14mm each. The single-period view is a narrow document and portrait
// suits it, so the orientation follows the layout rather than being a setting
// someone has to remember to change.
const orientation = computed(() => (props.isMonthly ? 'landscape' : 'portrait'))

const filename = computed(() => {
  const kind = props.isCash ? 'Cash-Received-and-Paid' : 'Income-Statement'
  const span = props.isMonthly ? 'monthly' : 'period'
  return `${kind}-${span}-${new Date().toISOString().slice(0, 10)}.pdf`
})

/**
 * How many month columns still land legibly on A4 landscape.
 *
 * At print metrics a figure column is ~68px and the label column ~190px, against
 * ~1047px of usable page (297mm less 10mm margins). Twelve months plus a total
 * is a hair over and html2pdf's fit-to-width absorbs it; beyond that it scales
 * the whole sheet down far enough to stop being readable, which is worse than
 * saying so.
 */
const legibleColumns = 12
const columnCount = computed(() =>
  props.isMonthly ? (props.isCash ? props.monthlyCash?.months.length : props.monthly?.months.length) ?? 0 : 0,
)
const tooWide = computed(() => columnCount.value > legibleColumns)

const loading = ref(false)

async function handlePrint() {
  await nextTick()
  const el = printArea.value
  if (!el) return

  loading.value = true
  // html2canvas renders computed colours literally, so a dark-theme page would
  // print white-on-white. Force the whole document black regardless of theme.
  el.querySelectorAll('div, td, th, span, p, table').forEach((child) => {
    ;(child as HTMLElement).style.color = '#000000'
  })

  try {
    await html2pdf()
      .set({
        margin:      10,
        filename:    filename.value,
        image:       { type: 'jpeg', quality: 0.98 },
        // windowWidth pinned to what the element actually needs, so a wide
        // month table is rendered whole and then scaled to the page instead of
        // being cut off at the viewport.
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          windowWidth: Math.max(el.scrollWidth, el.offsetWidth),
        },
        jsPDF:       { unit: 'mm', format: 'a4', orientation: orientation.value },
      })
      .from(el)
      .save()
    toast.success('Statement generated.')
  } catch {
    toast.error('Could not generate the statement.')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    :max-width="isMonthly ? 1200 : 820"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-card-title class="pa-4 pa-sm-5 pb-3 d-flex align-center flex-wrap ga-2">
        <span class="text-h6 font-weight-bold">Print Statement</span>
        <v-spacer />
        <v-select
          v-model="companyKey"
          :items="companyOptions"
          label="Issued by"
          variant="outlined"
          density="compact"
          hide-details
          style="max-width: 240px"
        />
      </v-card-title>
      <v-divider />

      <v-card-text class="pa-4 pa-sm-5" style="background: #ffffff">
        <v-alert
          v-if="tooWide"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-4 text-body-2"
        >
          {{ columnCount }} month columns will be scaled down to fit one page and may
          be hard to read. Narrow the date range to {{ legibleColumns }} months or fewer
          for a full-size statement.
        </v-alert>

        <!-- The same component the screen renders, plus the letterhead. Printing
             a separately-maintained copy is how the two drift apart. -->
        <div ref="printArea" class="print-sheet">
          <StatementBody
            :title="title"
            :period-line="periodLine"
            :basis-line="basisLine"
            :is-cash="isCash"
            :is-monthly="isMonthly"
            :period-rows="periodRows"
            :monthly-rows="monthlyRows"
            :monthly="monthly"
            :cash-statement="cashStatement"
            :monthly-cash="monthlyCash"
            :month-label="monthLabel"
            :letterhead="company"
            print
          />

          <div class="confidential-mark">Confidential</div>

          <!-- Who ran it and when. A statement with no provenance is the one
               that turns up in a meeting with nobody able to say which period
               or which system state produced it. -->
          <div class="print-footer">
            <div class="print-footer-note">
              This is a computer-generated document. No signature is required.
            </div>
            <div>
              Generated {{ new Date().toLocaleString('en-PH') }} &middot; {{ basisLine }}
            </div>
            <div class="print-footer-conf">
              Confidential &mdash; for internal use only. Do not distribute without authorisation.
            </div>
          </div>
        </div>
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-3 d-flex ga-2 justify-end">
        <v-btn variant="outlined" class="text-none" @click="emit('update:modelValue', false)">
          Cancel
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          class="text-none font-weight-bold"
          prepend-icon="mdi-printer"
          :loading="loading"
          @click="handlePrint"
        >
          Print {{ orientation === 'landscape' ? '(landscape)' : '' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* The preview IS the printed page, so it renders on white at print type sizes
   rather than inheriting the app theme. */
.print-sheet {
  background: #ffffff;
  color: #000000;
  font-size: 0.8rem;
}
/* Sits under the statement heading, above the figures — a reader should see it
   before the numbers, not after. */
.confidential-mark {
  margin-top: -0.25rem;
  margin-bottom: 1.25rem;
  text-align: center;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: #8a8a8a;
}
.print-footer {
  margin-top: 2rem;
  padding-top: 0.5rem;
  border-top: 1px solid #999999;
  font-size: 0.6rem;
  line-height: 1.6;
  text-align: center;
  color: #555555;
}
.print-footer-note {
  font-style: italic;
}
.print-footer-conf {
  font-weight: 600;
  letter-spacing: 0.04em;
}
</style>
