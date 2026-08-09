import { computed, ref, watch, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useCustomersDataStore } from '@/stores/customersData'
import type { CustomerType } from '@/stores/customersData'

/**
 * Customer typeahead for the order dialogs, shared by In-House and Ethical.
 *
 * WHY IT SEARCHES EVERY DEPARTMENT: `customers.department` is a home-channel
 * LABEL, not a gate. Most of the real customer file has no department at all,
 * and a customer can legitimately trade through more than one channel (a
 * drugstore may be both a POS and an Ethical account). Filtering the picker on
 * department is what made both order dialogs come up empty; staff pick the
 * customer at transaction time instead, with the channel recorded by the order's
 * own `transaction_type`.
 *
 * WHY IT SEARCHES SERVER-SIDE: ~5.3k customers is far too many to load into an
 * autocomplete. Results are capped and debounced.
 *
 * The caller passes in its own `customerId` ref so an existing form draft keeps
 * working untouched.
 */
export function useCustomerPicker(customerId: Ref<number | null>) {
  const store = useCustomersDataStore()
  const { searchResults, loading } = storeToRefs(store)

  const search = ref('')

  // Every customer the picker has shown, kept so a selection survives the next
  // keystroke: once the search term changes, the chosen customer usually drops
  // out of `searchResults`, and anything deriving from it (govt-PO visibility,
  // discount/rebate rates, payment terms) would silently reset to defaults.
  const seen = ref<Record<number, CustomerType>>({})
  watch(
    searchResults,
    (rows) => { for (const c of rows) seen.value[c.id] = c },
    { immediate: true, deep: false },
  )

  let debounce: ReturnType<typeof setTimeout> | undefined
  watch(search, (term) => {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => { void store.searchCustomers(term ?? '') }, 300)
  })
  onUnmounted(() => { if (debounce) clearTimeout(debounce) })

  const selectedCustomer = computed<CustomerType | null>(() =>
    customerId.value == null ? null : seen.value[customerId.value] ?? null)

  function describe(c: CustomerType): string {
    // Context that helps staff pick the right row out of thousands of
    // similarly-named pharmacies — several share a name outright.
    return [c.category, c.area, c.department ? c.department.toUpperCase() : 'Unassigned']
      .filter(Boolean).join(' · ')
  }

  const customerOptions = computed(() => {
    const rows = [...searchResults.value]
    // Keep the current selection in the list even when it no longer matches the
    // search term, or the autocomplete renders a blank field.
    const chosen = selectedCustomer.value
    if (chosen && !rows.some((c) => c.id === chosen.id)) rows.unshift(chosen)
    return rows.map((c) => ({
      title: `${c.name}${c.agency_type ? ` (${c.agency_type})` : ''}`,
      subtitle: describe(c),
      value: c.id,
      agent: c.agent_id,
    }))
  })

  async function init() {
    // Blank term → first page by name, so the dropdown is never empty on open.
    await store.searchCustomers('')
  }

  function reset() {
    customerId.value = null
    search.value = ''
  }

  return { search, customerOptions, selectedCustomer, loading, init, reset }
}
