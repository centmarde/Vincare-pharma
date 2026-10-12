// Reads that must see EVERY matching row.
//
// PostgREST caps a response (1000 rows by default) and cuts it off past that
// WITHOUT an error. A report or balance built from a cut-off response is
// quietly wrong — a cash account's history understates its balance, a
// statement drops receivables — so those reads go through here.
//
// Store-side on purpose: these run queries, and only stores touch Supabase.

const pageSize = 1000
// Ids per `.in()` filter. They travel in the URL, which proxies cap at a few
// kilobytes; a few hundred ids stays well under that.
const idsPerRequest = 200

type RangeableQuery<T> = {
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: unknown }>
}

/**
 * Every row a query matches, one page at a time.
 *
 * `build` must return a FRESH query on each call, ordered on a unique column
 * (or ending in one, e.g. created_at then id) — otherwise rows can shift
 * between pages and be skipped or read twice.
 */
export async function fetchAllRows<T = any>(build: () => RangeableQuery<T>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) break
  }
  return rows
}

/**
 * `fetchAllRows` for a query filtered by a list of ids, split into batches so
 * a long list does not overrun the URL. Rows come back batch by batch — sort
 * afterwards if order matters.
 */
export async function fetchAllRowsForIds<T = any>(
  ids: readonly number[],
  build: (batch: number[]) => RangeableQuery<T>,
): Promise<T[]> {
  const rows: T[] = []
  for (let i = 0; i < ids.length; i += idsPerRequest) {
    const batch = ids.slice(i, i + idsPerRequest)
    rows.push(...(await fetchAllRows<T>(() => build(batch))))
  }
  return rows
}
