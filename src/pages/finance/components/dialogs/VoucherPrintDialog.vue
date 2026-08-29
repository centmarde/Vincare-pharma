<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import html2pdf from 'html2pdf.js'
import { useToast } from 'vue-toastification'
import { voucherSignatories } from '@/stores/disbursementVouchersData'
import type { VoucherItemType, VoucherType } from '@/stores/disbursementVouchersData'
import { categoryTitle } from '@/stores/financeData'
import { companyFor, companyOptions, defaultCompanyFor } from '@/utils/companyProfiles'
import type { CompanyKey } from '@/utils/companyProfiles'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'

const props = defineProps<{
  modelValue: boolean
  voucher: VoucherType | null
  /** 1 = the original. Anything higher is a reprint and is marked as such. */
  copyNo: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const toast = useToast()

// The box is split in two: PARTICULARS (the purpose of that specific spend,
// stored in `particular`) and ACCOUNTS (the expense category it is charged to). Vouchers created before per-line explanations
// stored the category's own title in `particular`, so printing it verbatim
// would read "Meals | Meals" — those show an empty explanation instead.
// One department per voucher — stored on every line, entered and printed once.
const voucherDepartment = computed(() =>
  props.voucher?.items.find((line) => line.department)?.department ?? '')

/**
 * The voucher's single particulars. It is stored on every line (that is the
 * column the database has) but entered once, so the first line that carries a
 * real one wins. Vouchers saved before this stored the category's own title
 * there, which is not a description — those print blank.
 */
const voucherParticulars = computed(() => {
  // Same scan as the form's loadFrom: find the first line holding a REAL
  // particular, not merely the first non-empty one. A voucher from the per-line
  // era can carry the category-title fallback on line 1 and the description
  // further down, and stopping early would print it blank.
  const line = (props.voucher?.items ?? []).find(
    (i: VoucherItemType) => i.particular.trim() && i.particular !== categoryTitle(i.category),
  )
  return line?.particular ?? ''
})
const printArea = ref<HTMLElement | null>(null)

// Same legal entity as the POS receipt / Ethical invoice / Delivery Receipt /
// SOA — Exelmed is VinCare's printed-document letterhead regardless of module.
// This replaces the source form's Barangay / City / Province block, which is
// LGU-specific and has no meaning for a private distributor.
const companyKey = ref<CompanyKey>(defaultCompanyFor('disbursement_voucher'))
const company = computed(() => companyFor(companyKey.value))

// Every copy after the original must carry the mark, so a reprint can never be
// passed off as the original signed voucher.
const isReprint = computed(() => props.copyNo > 1)

// FIXED five account rows, padded with blanks when the voucher has fewer.
// This is deliberate and load-bearing: a constant number of rows means a
// constant sheet height, which means the RECORDED stamp can be overprinted at
// one calibrated position on every voucher. The form caps entry at five
// (MAX_VOUCHER_ACCOUNTS) so this is never exceeded -- a sixth account goes on a
// second voucher. Do not make this adaptive without re-solving the stamp.
const MIN_ROWS = 5
const fillerRows = computed(() =>
  Math.max(0, MIN_ROWS - (props.voucher?.items.length ?? 0)),
)

async function handlePrint() {
  await nextTick()
  const el = printArea.value
  if (!el || !props.voucher) return

  // html2canvas renders computed colours literally, so force the whole document
  // to black text regardless of the app theme the user is currently in.
  el.querySelectorAll('div, td, th, span, p').forEach((child) => {
    ;(child as HTMLElement).style.color = '#000000'
  })

  await html2pdf()
    .set({
      margin:      10,
      filename:    `${props.voucher.dv_no ?? 'disbursement-voucher'}${isReprint.value ? `-reprint-${props.copyNo}` : ''}.pdf`,
      image:       { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false },
      jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
    })
    .from(el)
    .save()

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
          <div ref="printArea" class="dv">

            <!-- Letterhead (replaces the source form's Barangay/City/Province) -->
            <div class="text-center mb-3">
              <div class="text-subtitle-1 font-weight-bold" style="letter-spacing: 2px;">{{ company.name }}</div>
              <div class="dv-fine">{{ company.line1 }}</div>
              <div class="dv-fine">{{ company.line2 }}</div>
              <div v-if="company.license" class="dv-fine">{{ company.license }}</div>
            </div>

            <div class="dv-box">
              <!-- Title + DV No. -->
              <div class="dv-row">
                <div class="dv-cell dv-title">DISBURSEMENT VOUCHER</div>
                <div class="dv-cell dv-nocol">
                  <div class="dv-label">DV No.</div>
                  <div class="dv-value font-weight-bold">{{ voucher.dv_no ?? '—' }}</div>
                </div>
              </div>

              <!-- Reprint mark: never on the original -->
              <div v-if="isReprint" class="dv-reprint">
                REPRINTED COPY — COPY NO. {{ copyNo }} · NOT THE ORIGINAL
                <span v-if="voucher.printed_at" class="dv-reprint-sub">
                  (original printed {{ formatDatePR_ISO(voucher.printed_at) }})
                </span>
              </div>

              <!-- Payee block -->
              <div class="dv-row">
                <div class="dv-cell dv-grow">
                  <span class="dv-label">Payee:</span>
                  <span class="dv-value">{{ voucher.payee ?? '' }}</span>
                </div>
                <div class="dv-cell dv-nocol">
                  <span class="dv-label">Date:</span>
                  <span class="dv-value">{{ voucher.voucher_date ? formatDatePR_ISO(voucher.voucher_date) : '' }}</span>
                </div>
              </div>
              <div class="dv-row">
                <div class="dv-cell dv-grow">
                  <span class="dv-label">Address:</span>
                  <span class="dv-value">{{ voucher.payee_address ?? '' }}</span>
                </div>
                <div class="dv-cell dv-nocol">
                  <span class="dv-label">Payment Mode:</span>
                  <span class="dv-value">{{ voucher.cash_account_name ?? '' }}</span>
                </div>
              </div>
              <div class="dv-row">
                <div class="dv-cell dv-grow">
                  <span class="dv-label">TIN:</span>
                  <span class="dv-value">{{ voucher.payee_tin ?? '' }}</span>
                </div>
                <div class="dv-cell dv-nocol">
                  <span class="dv-label">Dept:</span>
                  <span class="dv-value">{{ voucherDepartment }}</span>
                </div>
              </div>

              <div class="dv-row">
                <div class="dv-cell dv-grow">
                  <span class="dv-label">Ref:</span>
                  <span class="dv-value">{{ voucher.remarks ?? '' }}</span>
                </div>
              </div>

              <!-- Particulars -->
              <div class="dv-row dv-head">
                <div class="dv-cell dv-grow text-center font-weight-bold">PARTICULARS</div>
                <div class="dv-cell dv-acct text-center font-weight-bold">ACCOUNT NAME</div>
                <div class="dv-cell dv-nocol text-center font-weight-bold">AMOUNT</div>
              </div>

              <!-- One particulars for the whole voucher, sitting BESIDE the
                   accounts rather than above them: a single tall cell on the
                   left, with the account/amount rows stacked to its right. The
                   sheet is built from flex rows, not a <table>, so this is the
                   equivalent of a rowspan. -->
              <div class="dv-split">
                <div class="dv-cell dv-grow dv-value dv-particulars">{{ voucherParticulars }}</div>

                <div class="dv-splitright">
                  <div class="dv-row" v-for="line in voucher.items" :key="line.id">
                    <div class="dv-cell dv-acct dv-value">{{ categoryTitle(line.category) }}</div>
                    <div class="dv-cell dv-nocol text-right dv-value">{{ formatCurrency(line.amount) }}</div>
                  </div>
                  <div class="dv-row dv-filler" v-for="n in fillerRows" :key="`filler-${n}`">
                    <div class="dv-cell dv-acct">&nbsp;</div>
                    <div class="dv-cell dv-nocol">&nbsp;</div>
                  </div>
                  <div class="dv-row dv-total">
                    <div class="dv-cell dv-acct text-right font-weight-bold">TOTAL</div>
                    <div class="dv-cell dv-nocol text-right font-weight-bold">{{ formatCurrency(voucher.total_amount) }}</div>
                  </div>
                </div>
              </div>

              <!-- Prepared by / Checked by / Approved by, then a reserved
                   quarter for the RECORDED stamp (see VoucherStampDialog).
                   The cell is kept at the same width as the other three so the
                   row still divides the page evenly and the stamp has a box to
                   aim at. -->
              <div class="dv-row">
                <div
                  v-for="role in voucherSignatories"
                  :key="role.field"
                  class="dv-cell dv-quarter"
                >
                  <div class="dv-fine font-weight-bold">{{ role.label }}:</div>
                  <div class="dv-sign">
                    <!-- The typed name sits ON the rule; blank prints an empty
                         line to be filled in by hand. -->
                    <div class="dv-signname">{{ voucher.signatories[role.field] || '&nbsp;' }}</div>
                    <div class="dv-signline"></div>
                    <div class="dv-fine text-center"><em>(Signature Over Printed Name)</em></div>
                    <div class="dv-fine mt-2">Date: ____________</div>
                  </div>
                </div>

                <div class="dv-cell dv-quarter">
                  <div class="dv-fine font-weight-bold">Validation:</div>
                  <div class="dv-stampbox"></div>
                </div>
              </div>

              <!-- D. Received Payment -->
              <div class="dv-row">
                <div class="dv-cell dv-grow">
                  <div class="dv-fine mb-4">D. Received Payment</div>
                  <div class="d-flex">
                    <div class="dv-received-sign">
                      <div class="dv-signline"></div>
                      <div class="dv-fine text-center"><em>Signature Over Printed Name</em></div>
                    </div>
                    <div class="dv-received-fields">
                      <div class="dv-fine">
                        Check No.: <span class="dv-fill">{{ voucher.check_no ?? '' }}</span>
                      </div>
                      <div class="dv-fine">
                        Bank Name: <span class="dv-fill">{{ voucher.cash_account_institution ?? '' }}</span>
                      </div>
                      <div class="dv-fine">
                        OR No.: <span class="dv-fill">{{ voucher.or_si_no ?? '' }}</span>
                      </div>
                      <div class="dv-fine">
                        Date: <span class="dv-fill"></span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
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

<style scoped>
.dv {
  background: #ffffff;
  color: #000000;
  font-size: 11px;
}

.dv-box {
  border: 1px solid #000000;
}

.dv-row {
  display: flex;
  border-bottom: 1px solid #000000;
}

.dv-row:last-child {
  border-bottom: none;
}

.dv-cell {
  padding: 4px 6px;
  border-right: 1px solid #000000;
  min-height: 22px;
  /* A long unbroken string (a typo, a pasted URL) used to widen the whole sheet
     and force horizontal scroll instead of wrapping. */
  min-width: 0;
  overflow-wrap: anywhere;
}

.dv-particulars {
  /* Stretches to whatever height the accounts column ends up being. */
  white-space: pre-wrap;
}

.dv-cell:last-child {
  border-right: none;
}

.dv-grow {
  flex: 1 1 auto;
}

.dv-nocol {
  flex: 0 0 170px;
}

/* Account column. Fixed so the header cells line up exactly with the rows
   inside .dv-splitright, which is the same width by construction. */
.dv-acct {
  flex: 0 0 190px;
}

/* The particulars cell and the stack of account rows, side by side. */
.dv-split {
  display: flex;
  border-bottom: 1px solid #000000;
}

.dv-splitright {
  flex: 0 0 360px; /* .dv-acct 190 + .dv-nocol 170 */
  display: flex;
  flex-direction: column;
}

/* Inner rows draw their own separators; the last one must not double up with
   the border on .dv-split itself. */
.dv-splitright .dv-row:last-child {
  border-bottom: none;
}


.dv-stampbox {
  /* Deliberately empty — the RECORDED stamp is overprinted here on the signed
     original. Sized to the signature block beside it so the row stays level. */
  flex: 1 1 auto;
  min-height: 17mm;
}

.dv-quarter {
  flex: 1 1 25%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.dv-title {
  flex: 1 1 auto;
  text-align: center;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 1px;
  padding: 8px 6px;
}

.dv-label {
  font-size: 10px;
  font-weight: 700;
}

.dv-value {
  font-size: 11px;
}

.dv-fine {
  font-size: 9px;
  line-height: 1.35;
}

.dv-head {
  background: #f0f0f0;
}

.dv-filler .dv-cell {
  min-height: 20px;
}

.dv-total {
  background: #f0f0f0;
}

/* Deliberately loud: a reprint must be unmistakable at a glance on paper. */
.dv-reprint {
  border-bottom: 1px solid #000000;
  padding: 5px 6px;
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  background: #ffe9c7;
}

.dv-reprint-sub {
  font-weight: 400;
  font-size: 9px;
  letter-spacing: 0;
}

.dv-sign {
  margin-top: 26px;
}

.dv-signname {
  text-align: center;
  font-size: 10px;
  font-weight: 700;
  min-height: 13px;
}

.dv-signline {
  border-bottom: 1px solid #000000;
  margin-bottom: 2px;
}

.dv-received-sign {
  flex: 0 0 45%;
  margin-top: 26px;
  padding-right: 12px;
}

.dv-received-fields {
  flex: 1 1 auto;
}

.dv-fill {
  display: inline-block;
  min-width: 150px;
  border-bottom: 1px solid #000000;
}
</style>
