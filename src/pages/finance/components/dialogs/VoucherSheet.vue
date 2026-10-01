<script setup lang="ts">
import { computed, ref } from 'vue'
import { voucherSignatories } from '@/stores/disbursementVouchersData'
import type { VoucherItemType, VoucherType } from '@/stores/disbursementVouchersData'
import { useExpenseAccounts } from '../../composables/useExpenseAccounts'
import { maxVoucherAccounts } from '../../composables/useVoucherForm'
import { companyFor } from '@/utils/companyProfiles'
import type { CompanyKey } from '@/utils/companyProfiles'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'

// The printed disbursement voucher itself — the sheet, not the dialog around
// it. Split out of VoucherPrintDialog when that passed 500 lines; the markup
// and its print CSS moved VERBATIM, because the POSTED stamp is overprinted at
// a calibrated position and the signature row's distance from the top of the
// sheet is what keeps that working. Nothing here may change the rendered
// height.
//
// Being its own component also makes the sheet reusable — a batch print or a
// re-render for stamping can mount this rather than duplicate the layout.

const props = defineProps<{
  voucher: VoucherType
  /** 1 = the original. Anything higher prints the reprint mark. */
  copyNo: number
  companyKey: CompanyKey
}>()

// The element html2pdf captures. Exposed rather than passed down as a prop so
// the parent owns the PDF step while the sheet owns its own DOM.
const root = ref<HTMLElement | null>(null)
defineExpose({ root })

// ACCOUNT NAME prints the name from the chart of accounts, resolved from the
// code stored on the line. Older vouchers hold a legacy slug instead and are
// resolved through the slug map, so both print a real name rather than a code.
const { expenseAccountLabel } = useExpenseAccounts()

const company = computed(() => companyFor(props.companyKey))

// Every copy after the original must carry the mark, so a reprint can never be
// passed off as the original signed voucher.
const isReprint = computed(() => props.copyNo > 1)

// One department per voucher — stored on every line, entered and printed once.
const voucherDepartment = computed(() =>
  props.voucher.items.find((line) => line.department)?.department ?? '')

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
  const line = props.voucher.items.find(
    (i: VoucherItemType) => i.particular.trim() && i.particular !== expenseAccountLabel(i.category),
  )
  return line?.particular ?? ''
})

// A FIXED number of account rows, padded with blanks when the voucher has
// fewer. This is deliberate and load-bearing: a constant row count means a
// constant sheet height, which keeps the signature row a constant distance from
// the top -- and the POSTED stamp is overprinted against that row. Do not make
// this adaptive without re-solving the stamp.
//
// The count comes from the form's own cap rather than a second literal here, so
// the two can never drift apart.
const fillerRows = computed(() =>
  Math.max(0, maxVoucherAccounts - props.voucher.items.length),
)
</script>

<template>
  <div ref="root" class="dv">

    <!-- Reprint mark. Outside the bordered form and compact, but still
         ON THE SHEET so the PDF carries it — a reprint that printed
         identically to the original could be signed or processed a
         second time with nothing on the page to say otherwise. -->
    <div v-if="isReprint" class="dv-reprint">
      REPRINT · COPY {{ copyNo }}<span
        v-if="voucher.printed_at"
      > · orig. {{ formatDatePR_ISO(voucher.printed_at) }}</span>
    </div>

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
            <div class="dv-cell dv-acct dv-value">{{ expenseAccountLabel(line.category) }}</div>
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
/* Small, top-right, above the bordered form. Deliberately not a full-width
   banner any more — it was louder than the voucher itself. */
.dv-reprint {
  text-align: right;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #000000;
  margin-bottom: 2px;
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
