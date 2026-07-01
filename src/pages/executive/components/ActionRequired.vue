<script setup lang="ts">
import { formatCurrency } from '@/utils/helpers'

interface ActionItem {
  title: string
  description: string
  icon: string
  color: string
  priority: 'high' | 'medium' | 'low'
  value?: string
}

const actionItems: ActionItem[] = [
  {
    title: 'PO-2024-0123',
    description: 'Amoxicillin 500mg — Overdue by 5 days',
    icon: 'mdi-cancel',
    color: 'error',
    priority: 'high',
    value: '₱124,500',
  },
  {
    title: 'PO-2024-0108',
    description: 'Paracetamol 500mg — Partial delivery pending',
    icon: 'mdi-alert-circle-outline',
    color: 'warning',
    priority: 'high',
    value: '₱86,200',
  },
  {
    title: 'Supplier Invoice #4581',
    description: 'Payment overdue by 12 days',
    icon: 'mdi-account-clock-outline',
    color: 'warning',
    priority: 'medium',
    value: '₱45,800',
  },
  {
    title: 'Stock Approval',
    description: 'Metformin 500mg — Reorder level reached',
    icon: 'mdi-package-variant-closed',
    color: 'info',
    priority: 'medium',
  },
  {
    title: 'Supplier Renewal',
    description: 'MedHealth Corp. — Contract expiring in 7 days',
    icon: 'mdi-file-document-edit-outline',
    color: 'info',
    priority: 'low',
  },
]

function priorityColor(priority: 'high' | 'medium' | 'low'): string {
  if (priority === 'high') return 'error'
  if (priority === 'medium') return 'warning'
  return 'info'
}
</script>

<template>
  <v-card class="rounded-xl" elevation="0">
    <v-card-text class="pa-4 pa-md-6">
      <div class="d-flex align-center mb-4">
        <v-icon icon="mdi-bell-ring-outline" color="error" size="20" class="mr-2" />
        <span class="text-h6 font-weight-bold">Action Required</span>
        <v-spacer />
        <v-chip
          size="small"
          color="error"
          variant="tonal"
          label
        >
          {{ actionItems.length }} items
        </v-chip>
      </div>

      <div
        v-for="(item, idx) in actionItems"
        :key="idx"
        class="action-row"
      >
        <div class="d-flex align-start ga-3 mb-3">
          <v-avatar
            size="36"
            rounded="lg"
            :color="item.color"
            variant="tonal"
            class="flex-shrink-0"
          >
            <v-icon :icon="item.icon" :color="item.color" size="18" />
          </v-avatar>
          <div class="flex-grow-1" style="min-width: 0">
            <div class="d-flex align-center ga-2">
              <span class="text-body-2 font-weight-medium text-truncate">
                {{ item.title }}
              </span>
              <v-chip
                size="x-small"
                :color="priorityColor(item.priority)"
                variant="tonal"
                label
                class="flex-shrink-0"
              >
                {{ item.priority }}
              </v-chip>
            </div>
            <div class="text-caption text-medium-emphasis mt-1">
              {{ item.description }}
            </div>
          </div>
          <div v-if="item.value" class="text-body-2 font-weight-bold text-right flex-shrink-0">
            {{ item.value }}
          </div>
        </div>
        <v-divider v-if="idx < actionItems.length - 1" class="mb-3" />
      </div>
    </v-card-text>
  </v-card>
</template>