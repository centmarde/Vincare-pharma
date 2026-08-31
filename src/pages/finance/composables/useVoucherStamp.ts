import { computed, ref, watch } from 'vue'
import html2pdf from 'html2pdf.js'
import { useToast } from 'vue-toastification'
import type { VoucherType } from '@/stores/disbursementVouchersData'
import { formatDatePR_ISO } from '@/utils/helpers'

/**
 * The RECORDED overprint.
 *
 * This does NOT reprint the voucher. The signed original goes back into the
 * printer and a page that is blank except for the stamp is laid on top of it —
 * the signatures only exist on that sheet of paper, so a clean reprint claiming
 * to be recorded would be an unsigned document, which is worse than no mark.
 *
 * The page therefore has to match the voucher's geometry exactly (A4 portrait,
 * 10mm margin — the same numbers handlePrint uses), and the stamp is positioned
 * from the bottom-left corner of that page.
 */

// Millimetres from the TOP-LEFT of the sheet.
//
// The stamp aims at the reserved quarter in the signature row — the box that
// used to be "Received by", freed up at the accountant's request. Anchored from
// the TOP because html2pdf lays the voucher out downwards from the top margin,
// so the signature row's distance from the top is what stays constant; its
// distance from the bottom is not (it moves with the page's unused tail).
//
// Horizontal is exact: the printable width is 190mm (A4 less two 10mm margins),
// the row divides into four 47.5mm quarters, so the fourth starts at
// 10 + 3 x 47.5 = 152.5mm. 157mm centres a ~38mm stamp inside it.
//
// Vertical is an ESTIMATE. It depends on the rendered height of everything
// above the signature row, which cannot be computed here — that is what the
// alignment test and the calibration offsets are for. A voucher with more than
// eight particulars also pushes the row further down; see the note in the
// dialog.
const BASE_LEFT_MM = 157
const BASE_TOP_MM = 137

const CALIBRATION_KEY = 'vincare:voucher-stamp-calibration'

type Calibration = { dx: number; dy: number }

function loadCalibration(): Calibration {
  try {
    const raw = localStorage.getItem(CALIBRATION_KEY)
    if (!raw) return { dx: 0, dy: 0 }
    const parsed = JSON.parse(raw) as Partial<Calibration>
    return { dx: Number(parsed.dx) || 0, dy: Number(parsed.dy) || 0 }
  } catch {
    // A corrupt entry must never block printing.
    return { dx: 0, dy: 0 }
  }
}

export function useVoucherStamp(voucher: () => VoucherType | null) {
  const toast = useToast()

  const stampArea = ref<HTMLElement | null>(null)
  const generating = ref(false)

  // Every printer's paper path sits slightly differently, and re-feeding an
  // already-printed sheet skews it further. Calibrated once per machine and
  // kept locally — it describes the hardware, not the document.
  const offsetX = ref(loadCalibration().dx)
  const offsetY = ref(loadCalibration().dy)

  watch([offsetX, offsetY], ([dx, dy]) => {
    try {
      localStorage.setItem(CALIBRATION_KEY, JSON.stringify({ dx: Number(dx) || 0, dy: Number(dy) || 0 }))
    } catch {
      // Private-browsing / quota. The offset just won't persist.
    }
  })

  const leftMm = computed(() => BASE_LEFT_MM + (Number(offsetX.value) || 0))
  // Positive offsetY moves the stamp UP the page, matching the field label.
  const topMm = computed(() => BASE_TOP_MM - (Number(offsetY.value) || 0))

  const isRecorded = computed(() => voucher()?.status === 'recorded')

  // The expenses this voucher became. Printed on the stamp so the mark can be
  // traced back to the ledger instead of being decorative.
  const expenseNos = computed(() =>
    (voucher()?.items ?? [])
      .map((line) => line.expense_no)
      .filter((no): no is string => !!no))

  const recordedDate = computed(() => {
    const stamps = (voucher()?.items ?? [])
      .map((line) => line.expense_recorded_at)
      .filter((at): at is string => !!at)
      .sort()
    return stamps.length ? formatDatePR_ISO(stamps[0]) : ''
  })

  /**
   * @param testRun blank-paper dry run, so alignment can be checked against a
   *   spare printout before a signed original is ever fed through.
   */
  async function printStamp(testRun = false) {
    const current = voucher()
    if (!current || !stampArea.value) return
    if (!isRecorded.value) {
      toast.error('Only a recorded voucher can be stamped.')
      return
    }

    generating.value = true
    try {
      await html2pdf()
        .set({
          // No margin: the stamp is placed from the page edge itself, so
          // html2pdf must not add its own inset on top of that.
          margin: 0,
          filename: `${current.dv_no ?? 'voucher'}-recorded${testRun ? '-alignment-test' : ''}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 3, useCORS: true, backgroundColor: null, logging: false },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(stampArea.value)
        .save()

      toast.success(testRun
        ? 'Alignment test generated — print it on blank paper and hold it against a voucher.'
        : 'RECORDED mark generated. Feed the signed voucher through the manual tray.')
    } finally {
      generating.value = false
    }
  }

  function resetCalibration() {
    offsetX.value = 0
    offsetY.value = 0
  }

  return {
    stampArea, generating, offsetX, offsetY, leftMm, topMm,
    isRecorded, expenseNos, recordedDate,
    printStamp, resetCalibration,
  }
}
