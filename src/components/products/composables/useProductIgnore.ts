import { ref, computed } from 'vue'

const STORAGE_KEY = 'vincare_ignored_products'

export interface IgnoreEntry {
  ignoredUntil: string // ISO date string
}

// Module-scope singleton state — one shared ignored-product map for the whole
// app, mirroring how useConfirmDialog uses module-scope refs. This ensures
// every caller (StockStatusDialog, ProductsWidget, ManageIgnoredItemsDialog)
// observes the same reactive state and localStorage persistence, so ignoring
// a product in one place is instantly reflected everywhere else.
const ignoredMap = ref<Map<number, IgnoreEntry>>(new Map())

// Load persisted data on init
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string>
      const map = new Map<number, IgnoreEntry>()
      for (const [key, value] of Object.entries(parsed)) {
        map.set(Number(key), { ignoredUntil: value })
      }
      ignoredMap.value = map
    }
    console.log('[useProductIgnore] Loaded ignored products:', ignoredMap.value)
  } catch (err) {
    console.error('[useProductIgnore] Failed to load from localStorage:', err)
    ignoredMap.value = new Map()
  }
}

function saveToStorage() {
  try {
    const obj: Record<string, string> = {}
    for (const [id, entry] of ignoredMap.value.entries()) {
      obj[String(id)] = entry.ignoredUntil
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
    console.log('[useProductIgnore] Saved ignored products:', ignoredMap.value)
  } catch (err) {
    console.error('[useProductIgnore] Failed to save to localStorage:', err)
  }
}

// Clean up expired entries
function pruneExpired() {
  const now = Date.now()
  for (const [id, entry] of ignoredMap.value.entries()) {
    if (new Date(entry.ignoredUntil).getTime() <= now) {
      ignoredMap.value.delete(id)
    }
  }
  saveToStorage()
}

// Active (not yet expired) ignored product IDs
const activeIgnoredIds = computed<Set<number>>(() => {
  const now = Date.now()
  const active = new Set<number>()
  for (const [id, entry] of ignoredMap.value.entries()) {
    if (new Date(entry.ignoredUntil).getTime() > now) {
      active.add(id)
    }
  }
  return active
})

// All ignored product IDs (including expired, for debugging)
const allIgnoredIds = computed<number[]>(() => Array.from(ignoredMap.value.keys()))

// Active (non-expired) ignored product IDs as array
const activeIgnoredIdsArray = computed<number[]>(() => Array.from(activeIgnoredIds.value))

/**
 * Composable for ignoring (dismissing) products from stock status alerts
 * for a specified duration. Data is persisted in localStorage.
 */
export function useProductIgnore() {
  /**
   * Ignore a product for a given duration.
   * @param productId - The product ID to ignore
   * @param durationMs - Duration in milliseconds (e.g. 1 day, 1 week, 1 month)
   */
  function ignoreProduct(productId: number, durationMs: number) {
    const ignoredUntil = new Date(Date.now() + durationMs).toISOString()
    ignoredMap.value.set(productId, { ignoredUntil })
    saveToStorage()
  }

  /**
   * Remove a product from the ignore list.
   */
  function unignoreProduct(productId: number) {
    if (ignoredMap.value.delete(productId)) {
      saveToStorage()
    }
  }

  /**
   * Check if a product is currently ignored.
   */
  function isIgnored(productId: number): boolean {
    return activeIgnoredIds.value.has(productId)
  }

  /**
   * Get ignore info for a product, or null if not ignored.
   */
  function getIgnoreInfo(productId: number): { ignoredUntil: Date; remainingMs: number } | null {
    const entry = ignoredMap.value.get(productId)
    if (!entry) return null
    const until = new Date(entry.ignoredUntil)
    const remainingMs = until.getTime() - Date.now()
    if (remainingMs <= 0) return null
    return { ignoredUntil: until, remainingMs }
  }

  /**
   * Format remaining time for display.
   */
  function formatRemainingTime(remainingMs: number): string {
    const seconds = Math.floor(remainingMs / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days} day${days > 1 ? 's' : ''}`
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`
    if (minutes > 0) return `${minutes} min${minutes > 1 ? 's' : ''}`
    return 'Less than a minute'
  }

  return {
    // Core ignore state
    ignoredMap,
    activeIgnoredIds,
    activeIgnoredIdsArray,
    allIgnoredIds,
    ignoreProduct,
    unignoreProduct,
    isIgnored,
    getIgnoreInfo,
    formatRemainingTime,
  }
}

// Duration constants (exported for reuse)
export const IGNORE_DURATIONS = {
  ONE_DAY: 24 * 60 * 60 * 1000,
  ONE_WEEK: 7 * 24 * 60 * 60 * 1000,
  ONE_MONTH: 30 * 24 * 60 * 60 * 1000,
} as const

// Load persisted data once at module init (function declarations are hoisted)
loadFromStorage()
pruneExpired()