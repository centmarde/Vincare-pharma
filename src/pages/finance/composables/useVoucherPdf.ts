import html2pdf from 'html2pdf.js'

// Turning a rendered sheet into a PDF. Split out of VoucherPrintDialog when
// that component passed 500 lines — this is the one part with a third-party
// dependency and hand-tuned capture settings, and it has nothing to do with the
// dialog's chrome.
//
// Deliberately knows nothing about vouchers: it takes an element and a
// filename. The caller keeps the checks that are about the DOCUMENT (is the
// chart loaded, does it have too many accounts), because those decide whether
// printing is allowed at all, not how the capture is configured.

export function useVoucherPdf() {
  /**
   * Render `element` to an A4 PDF and hand it to the browser to save.
   *
   * Forces every descendant to black first: html2canvas renders computed
   * colours literally, so a voucher captured while the app is in dark theme
   * comes out with pale text on white. The mutation is left in place — the
   * sheet is re-rendered from state on the next open, and reverting mid-capture
   * risks html2canvas reading the colours back.
   *
   * `landscape` is for the register, a wide table. It also renders the
   * element at its full width so no column is cut off at the viewport; rows
   * stay whole across pages through `break-inside: avoid` in its stylesheet
   * (html2pdf's default page-break mode honours it).
   */
  async function generate(element: HTMLElement, filename: string, { landscape = false } = {}) {
    element.querySelectorAll('div, td, th, span, p, table').forEach((child) => {
      ;(child as HTMLElement).style.color = '#000000'
    })

    await html2pdf()
      .set({
        margin:      10,
        filename,
        image:       { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          ...(landscape ? { windowWidth: Math.max(element.scrollWidth, element.offsetWidth) } : {}),
          // A long register is one tall canvas, and browsers refuse canvases
          // past ~32,000px. Drop the resolution rather than fail to print.
          ...(landscape ? { scale: Math.min(2, 30000 / Math.max(element.scrollHeight, 1)) } : {}),
        },
        jsPDF:       { unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' },
      })
      .from(element)
      .save()
  }

  return { generate }
}
