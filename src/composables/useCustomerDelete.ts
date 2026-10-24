import { useToast } from 'vue-toastification'
import { useCustomersDataStore } from '@/stores/customersData'
import { useConfirmDialog } from '@/composables/useConfirmDialog'

const departmentLabel: Record<string, string> = { inhouse: 'In-House', ethical: 'Ethical', pos: 'POS' }

/**
 * Deleting a customer from the In-House / Ethical lists and the duplicates
 * view: say what the customer is and what goes with it before asking, and
 * refuse one that has documents with the reason (the store re-checks at the
 * moment of deleting).
 */
export function useCustomerDelete() {
  const store = useCustomersDataStore()
  const toast = useToast()
  const { confirmDialog } = useConfirmDialog()

  async function confirmAndDelete(customer: { id: number; name: string | null; address?: string | null; department?: string | null }): Promise<boolean> {
    let usage
    try {
      usage = (await store.fetchCustomerUsage([customer.id])).get(customer.id)!
    } catch {
      toast.error('Could not check what this customer is used by, so it was not deleted. Try again.')
      return false
    }
    if (usage.documents || usage.deliveryReceipts) {
      return store.deleteCustomer(customer.id) // refuses with the reason
    }
    const lines = [
      `Delete ${customer.name ?? `customer #${customer.id}`}?`,
      customer.address ? `Address: ${customer.address}` : '',
      `Channel: ${customer.department ? departmentLabel[customer.department] ?? customer.department : 'not assigned'}`,
      usage.terms ? `Its imported terms (${usage.terms} row${usage.terms === 1 ? '' : 's'}) are deleted with it.` : '',
      '',
      'It has no orders, sales or delivery receipts. This cannot be undone.',
    ].filter((l, i) => l !== '' || i === 4)
    const ok = await confirmDialog(lines.join('\n'), { title: 'Delete customer', confirmText: 'Delete' })
    if (!ok) return false
    return store.deleteCustomer(customer.id)
  }

  return { confirmAndDelete }
}
