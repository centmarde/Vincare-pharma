// Money inputs: the model stays a plain number while the field shows thousands
// separators ("100,000.00"), so a large amount reads at a glance instead of
// being counted digit by digit. Used by components/inputs/MoneyField.vue.

const maxDecimals = 2

/**
 * Keeps only digits and one decimal point, with at most two decimals.
 * Commas are dropped too, so a pasted "1,250.75" and a typed "1250.75" end up
 * the same. Check `looksNegative` first: a sign would be dropped here, turning
 * "-500" into 500.
 */
export function sanitizeMoneyInput(raw: string): string {
  let out = ''
  let seenPoint = false
  let decimals = 0
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') {
      if (seenPoint) {
        if (decimals >= maxDecimals) continue
        decimals++
      }
      out += ch
    } else if (ch === '.' && !seenPoint) {
      seenPoint = true
      out += ch
    }
  }
  return out
}

/**
 * True for an amount written as negative: a minus (hyphen or the typographic
 * U+2212 a spreadsheet copy can carry) or accounting brackets, "(500.00)".
 * These fields hold non-negative amounts, so such input is refused, never
 * quietly flipped positive.
 */
export function looksNegative(raw: string): boolean {
  return raw.includes('-') || raw.includes('−') || raw.includes('(')
}

/**
 * Adds thousands separators to a sanitized value without touching its
 * decimals, so a value still being typed ("1500.", "1500.5") keeps its shape.
 */
export function groupThousands(clean: string): string {
  if (!clean) return ''
  const [rawInteger, decimals] = clean.split('.')
  // Leading zeros go ("007" -> "7"), but a lone zero and "0.5" keep theirs.
  const integer = rawInteger.replace(/^0+(?=\d)/, '') || (decimals !== undefined ? '0' : '')
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return decimals === undefined ? grouped : `${grouped}.${decimals}`
}

/** "1,234.50" -> 1234.5. Anything unreadable, including '', is 0. */
export function parseMoneyInput(text: string): number {
  const value = parseFloat(text.replace(/,/g, ''))
  return Number.isFinite(value) ? value : 0
}

/** 1234.5 -> "1,234.50". Zero shows as empty so the placeholder reads instead. */
export function formatMoneyInput(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return ''
  return groupThousands(value.toFixed(maxDecimals))
}

const isMoneyChar = (ch: string) => (ch >= '0' && ch <= '9') || ch === '.'

/** How many digits and decimal points sit before `caret` in `text`. */
export function countMoneyChars(text: string, caret: number): number {
  let count = 0
  for (let i = 0; i < caret && i < text.length; i++) {
    if (isMoneyChar(text[i])) count++
  }
  return count
}

/**
 * The caret position just after the `count`-th digit or decimal point of
 * `text` — where the caret belongs once commas have been re-inserted.
 */
export function caretAfterMoneyChars(text: string, count: number): number {
  if (count <= 0) return 0
  let seen = 0
  for (let i = 0; i < text.length; i++) {
    if (isMoneyChar(text[i]) && ++seen === count) return i + 1
  }
  return text.length
}
