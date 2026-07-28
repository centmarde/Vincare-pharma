// Pure, dependency-free helpers for the change-request feature.
//
// Deliberately NOT in a store: `changeRequestsData.ts` calls `useToast()` at
// module level and pulls in the finance/GL/sales/in-house/ethical stores, so a
// *value* import of it eagerly runs all of that (the module-level store/toast
// factory pitfall that has caused a blank page in this codebase before).
// Keeping these here lets every store share them with zero side effects.

export type ProposedChange = Record<string, { from: unknown; to: unknown }>

// `change_requests.proposed_changes` is a **text** column, not jsonb (the lead
// dev's no-jsonb schema convention; it was jsonb in the original 2026-07-20
// migration and became text in the PR #83 restructure). PostgREST therefore
// returns the stored JSON as a STRING, so it must be parsed before use — a bare
// `as ProposedChange` cast compiles but silently yields a string, and every
// `changes[key]` lookup then reads undefined (while `Object.entries()` on it
// yields character/index pairs rather than fields). Tolerates an object too, so
// this keeps working if the column type ever changes back.
export function parseProposedChanges(raw: unknown): ProposedChange {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? (parsed as ProposedChange) : {}
    } catch {
      return {}
    }
  }
  return typeof raw === 'object' ? (raw as ProposedChange) : {}
}

// Matching write-side serializer, so the text column always receives real JSON
// text rather than relying on PostgREST's object→text coercion.
export function serializeProposedChanges(changes: ProposedChange): string {
  return JSON.stringify(changes ?? {})
}
