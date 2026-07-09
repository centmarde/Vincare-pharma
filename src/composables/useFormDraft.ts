import { watch, onBeforeUnmount } from 'vue'
import type { Ref } from 'vue'

// Durable draft persistence for input-heavy forms.
//
// Order/entry forms hold their state in composable refs, which live only in
// memory — a browser reload, crash, or dropped connection mid-entry wipes
// everything typed (imagine a PO with 100+ line items). This mirrors a form's
// refs to localStorage as the user types (debounced), restores them when the
// form reopens, and clears them on successful submit. Same localStorage-backed
// approach the theme store already uses; no extra dependency, and form state
// stays in the composables per the app's layered architecture.
//
// Usage (inside a form composable):
//   const draft = useFormDraft({
//     key: 'inhouse-raise-order',
//     version: 1,
//     refs: { customerId, govtPoNo, remarks, lines },
//     isEmpty: () => !customerId.value && !lines.value.some(l => l.product_id),
//   })
//   // in init(): if (!draft.restore() && !lines.value.length) addLine()
//   // on submit success: draft.clear()

type Refs = Record<string, Ref<unknown>>

export type FormDraftOptions = {
  /** Stable, form-unique id (namespaced per user internally). */
  key: string
  /** Bump when the persisted shape changes so old drafts are discarded, not misapplied. */
  version?: number
  /** The form's reactive state, keyed by name. Restored by assigning back to `.value`. */
  refs: Refs
  /** Return true when the form is untouched — an empty form is never persisted. */
  isEmpty: () => boolean
  /** Debounce for writes; default 400ms. */
  debounceMs?: number
  /** Transform the snapshot before it's JSON-stringified (rarely needed). */
  serialize?: (snapshot: Record<string, unknown>) => Record<string, unknown>
  /** Revive parsed data before it's applied — e.g. turn ISO strings back into Date. */
  deserialize?: (data: Record<string, unknown>) => Record<string, unknown>
}

const PREFIX = 'vincare:draft:'

// Namespaced per user so drafts never leak across accounts on a shared machine.
function storageKey(key: string): string {
  let authId: string | null = null
  try { authId = localStorage.getItem('auth_id') } catch { /* storage disabled */ }
  return `${PREFIX}${key}:${authId ?? 'anon'}`
}

export function useFormDraft(opts: FormDraftOptions) {
  const { key, version = 1, refs, isEmpty, debounceMs = 400 } = opts
  const fullKey = storageKey(key)
  let timer: ReturnType<typeof setTimeout> | null = null

  function snapshot(): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(refs)) out[k] = refs[k].value
    return out
  }

  function write() {
    // Never persist an untouched form; clear any stale draft if it's been emptied.
    if (isEmpty()) {
      try { localStorage.removeItem(fullKey) } catch { /* ignore */ }
      return
    }
    const data = opts.serialize ? opts.serialize(snapshot()) : snapshot()
    try {
      localStorage.setItem(fullKey, JSON.stringify({ v: version, t: Date.now(), data }))
    } catch {
      // Storage full or disabled — drafting is best-effort, don't disrupt the form.
    }
  }

  // Returns true if a valid, same-version, non-empty draft was applied.
  function restore(): boolean {
    let raw: string | null = null
    try { raw = localStorage.getItem(fullKey) } catch { return false }
    if (!raw) return false

    let parsed: { v?: number; data?: Record<string, unknown> }
    try { parsed = JSON.parse(raw) } catch { clear(); return false }
    // A draft from an older shape can't be trusted — discard rather than misapply.
    if (parsed.v !== version || !parsed.data || typeof parsed.data !== 'object') { clear(); return false }

    const data = opts.deserialize ? opts.deserialize(parsed.data) : parsed.data
    let applied = false
    for (const k of Object.keys(refs)) {
      if (k in data) { refs[k].value = data[k]; applied = true }
    }
    return applied
  }

  function clear() {
    if (timer) { clearTimeout(timer); timer = null }
    try { localStorage.removeItem(fullKey) } catch { /* ignore */ }
  }

  const stopWatch = watch(
    Object.values(refs),
    () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(write, debounceMs)
    },
    { deep: true },
  )

  onBeforeUnmount(() => {
    if (timer) { clearTimeout(timer); write() } // flush a pending debounced write
    stopWatch()
  })

  return { restore, clear }
}

// Clear every persisted draft for the current machine — called on logout so a
// user's in-progress drafts don't linger for whoever logs in next.
export function clearAllFormDrafts() {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(PREFIX)) keys.push(k)
    }
    for (const k of keys) localStorage.removeItem(k)
  } catch { /* storage disabled — nothing to clear */ }
}
