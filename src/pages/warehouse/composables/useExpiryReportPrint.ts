import { nextTick, ref, unref } from 'vue'
import type { Ref } from 'vue'
import html2pdf from 'html2pdf.js'
import { useToast } from 'vue-toastification'

/**
 * Renders a report element to a PDF.
 *
 * Split out of ExpiryReportPrintDialog so the dialog is markup and formatting
 * only. Nothing here is specific to the expiring-inventory sheet — it takes an
 * element and a filename — so any other printable report can reuse it rather
 * than growing a second copy of the html2canvas workarounds below.
 *
 * @param printArea the element to rasterise
 * @param filename  the download name, read at print time so a reactive
 *                  filename (format or month picker) is always current
 */
export function useExpiryReportPrint(
  printArea: Ref<HTMLElement | null>,
  filename: Ref<string> | (() => string),
) {
  const toast = useToast()
  const loading = ref(false)

  function resolveFilename(): string {
    return typeof filename === 'function' ? filename() : unref(filename)
  }

  /**
   * Force the sheet black before rasterising.
   *
   * html2canvas renders computed colours literally, so a dark-theme page would
   * otherwise print white-on-white.
   */
  function forcePrintColours(el: HTMLElement) {
    el.querySelectorAll('div, td, th, span, p, table, li, h1, h2, h3').forEach((child) => {
      ;(child as HTMLElement).style.color = '#000000'
    })
    // ...but a few elements are meant to read quieter than the body — the
    // confidential mark especially, which should sit in the margin of attention
    // rather than compete with the figures. Restored after the blanket pass
    // rather than excluded from it, so the dark-theme guarantee still holds for
    // everything and these are the only deliberate exceptions.
    el.querySelectorAll('.exp-confidential, .exp-muted, .exp-footnote, .exp-footer').forEach(
      (child) => {
        ;(child as HTMLElement).style.color = '#6b6b6b'
      },
    )
  }

  async function handlePrint() {
    await nextTick()
    const el = printArea.value
    if (!el) return

    loading.value = true
    forcePrintColours(el)

    try {
      await html2pdf()
        .set({
          margin: 10,
          filename: resolveFilename(),
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,
            windowWidth: Math.max(el.scrollWidth, el.offsetWidth),
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          // No `pagebreak` option: html2pdf already defaults to mode
          // ['css', 'legacy'], so `break-inside: avoid` in the report stylesheet
          // keeps rows and sections whole. The field is also absent from the
          // library's bundled types, so setting it would cost a cast for
          // behaviour we get for free.
        })
        .from(el)
        .save()
      toast.success('Report generated.')
    } catch {
      toast.error('Could not generate the report.')
    } finally {
      loading.value = false
    }
  }

  return { loading, handlePrint }
}
