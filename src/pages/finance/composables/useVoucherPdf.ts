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
   */
  async function generate(element: HTMLElement, filename: string) {
    element.querySelectorAll('div, td, th, span, p').forEach((child) => {
      ;(child as HTMLElement).style.color = '#000000'
    })

    await html2pdf()
      .set({
        margin:      10,
        filename,
        image:       { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false },
        jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(element)
      .save()
  }

  return { generate }
}
