import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useExecutiveStore = defineStore('executive', () => {
  const pendingPrApprovalCount = ref(0)

  function setPendingPrApprovalCount(count: number) {
    pendingPrApprovalCount.value = count
  }

  return {
    pendingPrApprovalCount,
    setPendingPrApprovalCount,
  }
})