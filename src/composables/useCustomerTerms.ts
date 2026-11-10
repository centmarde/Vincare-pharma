import { ref, computed } from 'vue'
import { useToast } from 'vue-toastification'
import { useDiscountsDataStore, emptyCustomerTerms, summarizeTerms, termsDiffer, termsFromRows } from '@/stores/discountsData'
import type { CustomerTerms } from '@/stores/discountsData'
import type { CreateCustomerData, CustomerType } from '@/stores/customersData'

// The terms editor's state for a customer form (Ethical, In-House, POS): load
// the customer's terms, tell the form what still blocks a save, and write the
// terms after the customer itself is saved. Only writes when something changed
// — opening a customer to fix a phone number never rewrites their terms.

const clone = (t: CustomerTerms): CustomerTerms => JSON.parse(JSON.stringify(t))

export function useCustomerTerms() {
  const discountsStore = useDiscountsDataStore()
  const toast = useToast()

  const terms = ref<CustomerTerms>(emptyCustomerTerms())
  const baseline = ref<CustomerTerms>(emptyCustomerTerms())
  const loading = ref(false)
  /**
   * The rows could not be read. Saving then would replace terms nobody saw,
   * so the editor is read-only until the form is reopened.
   */
  const loadFailed = ref(false)

  const changed = computed(() => termsDiffer(terms.value, baseline.value))

  /** Why the customer cannot be saved yet, if anything — only when terms changed. */
  const blocker = computed(() => {
    if (!changed.value) return ''
    if (loadFailed.value) return 'The customer\'s terms could not be loaded, so they cannot be changed now. Reopen the customer and try again.'
    return summarizeTerms(terms.value).missingNames ? 'Enter the name of every person getting a rebate or ads share.' : ''
  })

  /** Load a customer's terms into the editor (null = a new customer). */
  async function load(customer: Pick<CustomerType, 'id' | 'markup_percent' | 'discount_rate' | 'rebate_rate'> | null) {
    loadFailed.value = false
    if (!customer) {
      terms.value = emptyCustomerTerms()
      baseline.value = emptyCustomerTerms()
      return
    }
    loading.value = true
    try {
      discountsStore.error = ''
      const rows = await discountsStore.fetchForCustomer(customer.id)
      loadFailed.value = !!discountsStore.error
      terms.value = termsFromRows(rows, customer)
      baseline.value = clone(terms.value)
    } finally {
      loading.value = false
    }
  }

  /**
   * The single-value customer columns, kept in step with the terms for the
   * readers that still use them (and as the fallback when a customer has no
   * rows). Empty when the terms were not changed.
   */
  function customerColumns(): Partial<CreateCustomerData> {
    if (!changed.value) return {}
    const summary = summarizeTerms(terms.value)
    return {
      markup_percent: summary.markup,
      discount_rate: summary.discount || null,
      rebate_rate: summary.rebateTotal || null,
      rebate_ratio_distribution: summary.distribution,
    }
  }

  /** Save the terms for a customer that has just been saved. */
  async function saveFor(customer: Pick<CustomerType, 'id' | 'name'>) {
    if (!changed.value || loadFailed.value) return true
    const result = await discountsStore.saveCustomerTerms(customer.id, customer.name, terms.value)
    if (!result.success) {
      toast.warning(`The customer was saved, but their terms were not: ${result.error}`)
      return false
    }
    baseline.value = clone(terms.value)
    return true
  }

  return { terms, loading, loadFailed, changed, blocker, load, customerColumns, saveFor }
}
