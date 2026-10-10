// GL side of a void: reverse the document's projected journal entry. Shared by
// every applier that voids a booked document.

import { supabase } from '@/lib/supabase'
import { useGLDataStore } from '@/stores/glData'

// Reverse a document's projected GL entry (the ORIGINAL booking, not a mirror
// reversal — reverses_entry IS NULL — so a retry can't re-reverse). Returns
// ok when there's nothing to reverse (never projected). Shared by every void.
export async function reverseProjectedEntry(
  referenceType: 'disbursement' | 'collection',
  referenceId: number,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const gl = useGLDataStore()
  const { data: je } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('reference_type', referenceType)
    .eq('reference_id', referenceId)
    .eq('status', 'posted')
    .is('reverses_entry', null)
    .maybeSingle()
  if (!je) return { ok: true }
  const rev = await gl.reverseJournalEntry(je.id, userId)
  return rev.success ? { ok: true } : { ok: false, error: rev.error }
}
