import { ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import { useToast } from 'vue-toastification'
import { useAuthUserStore } from '@/stores/authUser'
import { useLogsDataStore } from '@/stores/logsData'
import { useStockSourcingStore } from '@/stores/stockSourcingData'
import type { StockLocationId } from '@/stores/stockSourcingData'
import { generateNextNumber, insertWithDocRetry, getErrorMessage } from '@/utils/helpers'

// Customer returns. The company never refunds money — goods come back and other
// goods go out in their place, worth less or more. This store owns the INBOUND
// half: the return document and putting the stock back. The replacement is an
// ordinary sale through the existing flow (see docs/RETURNS_PLAN.md).
//
// A return is a transactions row of transaction_type 'sales_return', numbered
// SR-YYYY-NNN into sales_return_no, with its lines in transaction_items using
// qty_stock_in — the INBOUND direction, the same one PO receipt uses. It never
// writes qty_stock_out: a row only ever carries one direction, and readers pick
// the column by transaction_type.

/**
 * What shape a line came back in.
 *
 * Only 'broken' is new information — 'expired' is equally derivable from the
 * batch's expiry_date, and is recorded anyway so a line explains on its own why
 * it did not go back into stock.
 */
export type ReturnCondition = 'good' | 'expired' | 'broken'

/**
 * How the return was settled. Deliberately a property of the TRANSACTION, not
 * of the customer.
 *
 * Keying this off the customer is not possible on this data: `department` is
 * set on 4 of 5,280 customers and `term_days` on 1,490, so "is this a credit
 * customer" cannot be answered for most of the file. How a return was settled,
 * by contrast, is known with certainty at the moment it is recorded.
 *
 * 'swapped'  — replacement goods issued in the same action. The revenue legs
 *              net out and no receivable is created, so it works for a cash
 *              walk-in and a credit customer alike. POS is always this.
 * 'credited' — nothing taken yet; the value sits on the customer's account as
 *              a real credit balance. Requires an identified customer, because
 *              value cannot be owed to nobody.
 */
export type ReturnSettlement = 'swapped' | 'credited'

/** Conditions whose stock is NOT sellable and so never re-enters inventory. */
const unsellableConditions: ReturnCondition[] = ['expired', 'broken']

export type SalesReturnLineInput = {
  /** The BATCH row the goods came from — one `products` row is one batch. */
  product_id: number
  qty: number
  /** Value credited to the customer per unit. */
  unit_price: number
  /** Company cost per unit, snapshotted for the GL's inventory leg. */
  cost_price?: number | null
  condition: ReturnCondition
}

export type SalesReturnLine = {
  id: number
  product_id: number | null
  product_name: string | null
  batch_no: string | null
  expiry_date: string | null
  qty: number
  unit_price: number
  line_total: number
  cost_price: number | null
  condition: ReturnCondition | null
}

export type SalesReturnType = {
  id: number
  return_no: string | null
  created_at: string
  status: string | null
  /** Settlement mode — carried in `status`, which has no CHECK constraint. */
  settlement: ReturnSettlement | null
  customer_id: number | null
  customer_name: string | null
  warehouse_id: number | null
  total_amount: number
  remarks: string | null
  created_by: string | null
  lines: SalesReturnLine[]
}

function mapRowToReturn(row: any): SalesReturnType {
  const items = (row.transaction_items ?? []) as any[]
  return {
    id: row.id,
    return_no: row.sales_return_no ?? null,
    created_at: row.created_at,
    status: row.status ?? null,
    settlement: (row.status ?? null) as ReturnSettlement | null,
    customer_id: row.customer_id ?? null,
    customer_name: row.customer?.name ?? null,
    warehouse_id: row.warehouse_id ?? null,
    total_amount: Number(row.total_amount ?? 0),
    remarks: row.remarks ?? null,
    created_by: row.created_by ?? null,
    lines: items.map((li) => ({
      id: li.id,
      product_id: li.product_id ?? null,
      product_name: li.products?.product_name ?? null,
      batch_no: li.products?.batch_no ?? null,
      expiry_date: li.products?.expiry_date ?? null,
      qty: Number(li.qty_stock_in ?? 0),
      unit_price: Number(li.unit_price ?? 0),
      line_total: Number(li.line_total ?? 0),
      cost_price: li.cost_price == null ? null : Number(li.cost_price),
      condition: (li.return_condition ?? null) as ReturnCondition | null,
    })),
  }
}

const returnSelect = `
  id, created_at, sales_return_no, status, customer_id, warehouse_id,
  total_amount, remarks, created_by,
  customer:customer_id ( id, name ),
  transaction_items (
    id, product_id, qty_stock_in, unit_price, line_total, cost_price,
    return_condition,
    products ( id, product_name, batch_no, expiry_date )
  )
`

export const useSalesReturnsDataStore = defineStore('salesReturnsData', () => {
  // Store factories need an active Pinia instance, so they are resolved inside
  // the setup body rather than at module scope.
  const toast = useToast()
  const authStore = useAuthUserStore()
  const logsStore = useLogsDataStore()
  const sourcingStore = useStockSourcingStore()

  const returns: Ref<SalesReturnType[]> = ref([])
  const currentReturn: Ref<SalesReturnType | undefined> = ref(undefined)
  const loading = ref(false)
  const error: Ref<string> = ref('')

  function handleError(err: unknown, fallback: string) {
    console.error(err)
    error.value = getErrorMessage(err) || fallback
  }

  function clearError() {
    error.value = ''
  }

  async function fetchReturns(options: { warehouseId?: number | null } = {}) {
    loading.value = true
    clearError()
    try {
      let query = supabase
        .from('transactions')
        .select(returnSelect)
        // Every transactions query filters by type — the hub holds every kind
        // of document and an unfiltered read would sweep in all of them.
        .eq('transaction_type', 'sales_return')
        .order('created_at', { ascending: false })

      if (options.warehouseId != null) query = query.eq('warehouse_id', options.warehouseId)

      const { data, error: fetchError } = await query
      if (fetchError) throw fetchError
      returns.value = (data ?? []).map(mapRowToReturn)
      return returns.value
    } catch (err) {
      handleError(err, 'Failed to load returns')
      return []
    } finally {
      loading.value = false
    }
  }

  async function fetchReturnById(id: number) {
    loading.value = true
    clearError()
    try {
      const { data, error: fetchError } = await supabase
        .from('transactions')
        .select(returnSelect)
        .eq('transaction_type', 'sales_return')
        .eq('id', id)
        .maybeSingle()
      if (fetchError) throw fetchError
      currentReturn.value = data ? mapRowToReturn(data) : undefined
      return currentReturn.value
    } catch (err) {
      handleError(err, `Failed to load return ${id}`)
      return undefined
    } finally {
      loading.value = false
    }
  }

  /**
   * Deletes a half-written return.
   *
   * The header is the first row written and it carries a real SR number the
   * moment it exists, so a failure further down would otherwise leave a
   * document that looks accepted but has no lines and no stock behind it. Same
   * rollback the sale and remittance flows carry, for the same reason.
   */
  async function rollbackReturn(returnId: number) {
    await supabase.from('transaction_items').delete().eq('transaction_id', returnId)
    await supabase.from('transactions').delete().eq('id', returnId)
  }

  /**
   * Records a customer return and puts the sellable stock back.
   *
   * Only 'good' lines are restocked. Expired and broken goods are a loss the
   * moment they come back: they never re-enter sellable stock, and their cost
   * is ALREADY in COGS from the original sale, so there is deliberately no
   * write-off entry to make here — booking one would expense them twice.
   *
   * @param locationId where the goods physically go back — null for the main
   * warehouse, a warehouse id for an outlet. Must match where the return was
   * accepted; stockSourcingData resolves the two shapes.
   */
  async function createReturn(payload: {
    customerId?: number | null
    locationId: StockLocationId
    lines: SalesReturnLineInput[]
    settlement: ReturnSettlement
    remarks?: string | null
  }): Promise<{ success: boolean; returnId?: number; returnNo?: string | null }> {
    loading.value = true
    clearError()

    const { customerId = null, locationId, lines, settlement, remarks = null } = payload

    const { user, error: authError } = await authStore.getCurrentUser()
    if (authError || !user) {
      toast.error('User not authenticated.')
      loading.value = false
      return { success: false }
    }

    // A credit has to be owed to somebody. Without a customer there is no
    // account to carry it, and the balance would be stranded against nobody —
    // so an unidentified walk-in must take goods now, which is also the rule
    // the business already set for POS.
    if (settlement === 'credited' && customerId == null) {
      toast.warning('Select a customer to leave this return as credit, or issue replacement goods now.')
      loading.value = false
      return { success: false }
    }

    const validLines = lines.filter((l) => l.product_id != null && l.qty > 0)
    if (!validLines.length) {
      toast.warning('Add at least one returned item.')
      loading.value = false
      return { success: false }
    }

    const totalAmount = validLines.reduce((sum, l) => sum + l.qty * Number(l.unit_price ?? 0), 0)
    const year = new Date().getFullYear()

    try {
      const { data: created, docNo: returnNo, error: insertError } = await insertWithDocRetry<{ id: number }>(
        () => generateNextNumber('sales_return_no', `SR-${year}-`, ['reference_no']),
        async (docNo) =>
          supabase
            .from('transactions')
            .insert({
              // Mirrored into reference_no as well, the same as sale / in-house /
              // ethical do. That is not cosmetic: the partial unique index lives
              // on reference_no, NOT on sales_return_no, so without this the
              // 23505 that insertWithDocRetry retries on could never fire and a
              // concurrent create would mint a duplicate SR number in silence.
              reference_no: docNo,
              transaction_type: 'sales_return',
              sales_return_no: docNo,
              customer_id: customerId,
              warehouse_id: locationId,
              total_amount: totalAmount,
              subtotal: totalAmount,
              // Settlement mode lives in status: it is the one existing column
              // that carries it, and it has no CHECK constraint to widen.
              status: settlement,
              remarks,
              created_by: user.id,
            })
            .select('id')
            .single(),
      )
      if (insertError || !created) throw insertError ?? new Error('Failed to record the return.')

      const { error: itemsError } = await supabase.from('transaction_items').insert(
        validLines.map((l) => ({
          transaction_id: created.id,
          product_id: l.product_id,
          // Inbound direction only — a sales_return never sets qty_stock_out.
          qty_stock_in: l.qty,
          unit_price: l.unit_price,
          line_total: l.qty * Number(l.unit_price ?? 0),
          cost_price: l.cost_price ?? null,
          return_condition: l.condition,
        })),
      )
      if (itemsError) {
        await rollbackReturn(created.id)
        throw itemsError
      }

      // Restock is best-effort and runs AFTER the document is safely written:
      // it cannot be rolled back line-by-line, and a return whose stock did not
      // land is recoverable by hand, whereas stock credited against a document
      // that then failed to save is not. Matches the project's accepted
      // no-atomicity trade-off for multi-table money/stock operations.
      const restockable = validLines.filter((l) => !unsellableConditions.includes(l.condition))
      const failed: number[] = []
      for (const line of restockable) {
        const ok = await sourcingStore.returnStock(locationId, line.product_id, line.qty)
        if (!ok) failed.push(line.product_id)
      }

      try {
        await logsStore.createLog({
          action: 'sales_return',
          description:
            `Recorded return ${returnNo} — ${validLines.length} line(s), ` +
            `${restockable.length} restocked, ` +
            `${validLines.length - restockable.length} written off as expired/broken`,
          module: 'sales',
          transaction_id: created.id,
        })
      } catch (logErr) {
        console.error('[Logging] Failed to log sales return:', logErr)
      }

      if (failed.length) {
        // Named rather than swallowed: the document is correct but the stock is
        // short, and only someone told about it can put that right.
        toast.warning(
          `Return ${returnNo} saved, but ${failed.length} line(s) could not be restocked. Check warehouse stock.`,
        )
      } else {
        toast.success(`Return ${returnNo} recorded.`)
      }

      return { success: true, returnId: created.id, returnNo }
    } catch (err) {
      handleError(err, 'Failed to record the return')
      toast.error(error.value || 'Failed to record the return.')
      return { success: false }
    } finally {
      loading.value = false
    }
  }

  return {
    returns,
    currentReturn,
    loading,
    error,
    fetchReturns,
    fetchReturnById,
    createReturn,
    clearError,
  }
})
