import { computed, ref, watch } from 'vue'
import { useCustomersDataStore } from '@/stores/customersData'
import type { CustomerType, CustomerUsage } from '@/stores/customersData'
import { useCustomerDelete } from '@/composables/useCustomerDelete'
import { customerNameKey, getErrorMessage } from '@/utils/helpers'

/** One copy in a group of customers sharing a name. */
export type DuplicateCopy = {
  customer: CustomerType
  usage: CustomerUsage
  /** In this page's channel (or unassigned), so this page may delete it. */
  inScope: boolean
  /** Null when it can be deleted; otherwise why not, for the row. */
  blockedReason: string | null
}

export type DuplicateGroup = { key: string; name: string; copies: DuplicateCopy[] }

const groupsPerPage = 10

/**
 * Customers that share a name, side by side, so staff can tell a real
 * duplicate (same address, no orders) from a separate branch before deleting.
 *
 * A group is listed when at least one copy belongs to this page — its own
 * channel or unassigned. Copies in another channel are shown so the whole
 * picture is visible, but only this page's copies can be deleted from here.
 */
export function useCustomerDuplicates(department: 'inhouse' | 'ethical') {
  const store = useCustomersDataStore()
  const { confirmAndDelete } = useCustomerDelete()

  const open = ref(false)
  const loading = ref(false)
  const error = ref('')
  const groups = ref<DuplicateGroup[]>([])
  const search = ref('')
  const page = ref(1)
  /** Set after a deletion, so the page can refresh its list. */
  const changed = ref(0)

  const inScope = (c: CustomerType) => c.department === department || c.department == null

  async function load() {
    loading.value = true
    error.value = ''
    try {
      const byName = new Map<string, CustomerType[]>()
      for (const c of await store.fetchNamedCustomers()) {
        const key = customerNameKey(c.name)
        if (!key) continue
        byName.set(key, [...(byName.get(key) ?? []), c])
      }
      const shared = [...byName.entries()].filter(([, list]) => list.length > 1 && list.some(inScope))
      const usage = await store.fetchCustomerUsage(shared.flatMap(([, list]) => list.map((c) => c.id)))
      groups.value = shared
        .map(([key, list]) => ({
          key,
          name: list[0].name?.trim() ?? key,
          copies: list.map((customer) => {
            const u = usage.get(customer.id) ?? { documents: 0, deliveryReceipts: 0, terms: 0 }
            const own = inScope(customer)
            const blockedReason = !own
              ? 'Belongs to another channel'
              : u.documents || u.deliveryReceipts
                ? `Has ${[u.documents ? `${u.documents} order/sale` : '', u.deliveryReceipts ? `${u.deliveryReceipts} DR` : ''].filter(Boolean).join(', ')} — keep this one`
                : null
            return { customer, usage: u, inScope: own, blockedReason }
          }),
        }))
        .sort((a, b) => a.key.localeCompare(b.key))
    } catch (err) {
      error.value = getErrorMessage(err) || 'Could not load the duplicates.'
      groups.value = []
    } finally {
      loading.value = false
    }
  }

  const filtered = computed(() => {
    const q = customerNameKey(search.value)
    return q ? groups.value.filter((g) => g.key.includes(q)) : groups.value
  })
  const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / groupsPerPage)))
  const pagedGroups = computed(() => filtered.value.slice((page.value - 1) * groupsPerPage, page.value * groupsPerPage))
  const extraCopies = computed(() => groups.value.reduce((n, g) => n + g.copies.length - 1, 0))
  watch(search, () => { page.value = 1 })

  async function openView() {
    open.value = true
    search.value = ''
    page.value = 1
    await load()
  }

  async function remove(copy: DuplicateCopy) {
    if (copy.blockedReason) return
    if (!(await confirmAndDelete(copy.customer))) return
    changed.value += 1
    // Drop it here at once; a group left with one copy is no longer a duplicate.
    groups.value = groups.value
      .map((g) => ({ ...g, copies: g.copies.filter((c) => c.customer.id !== copy.customer.id) }))
      .filter((g) => g.copies.length > 1)
    if (page.value > pageCount.value) page.value = pageCount.value
  }

  return {
    open, loading, error, groups, search, page, pageCount, pagedGroups, extraCopies, changed,
    openView, load, remove,
  }
}
