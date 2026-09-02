<script setup lang="ts">
import type { DraftPRType } from '@/stores/draftPRData'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { formatCurrency, formatDatePR_ISO } from '@/utils/helpers'

interface PRDraftsDialogProps {
  modelValue: boolean
  drafts: DraftPRType[]
  loading?: boolean
}

const props = defineProps<PRDraftsDialogProps>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  resume: [draftId: number]
  delete: [draftId: number]
}>()

const { confirmDialog } = useConfirmDialog()

function draftSummary(draft: DraftPRType): string {
  const names = draft.items.map(item => item.product_name).filter(Boolean)
  if (!names.length) return 'No items'
  if (names.length === 1) return String(names[0])
  return `${names[0]} +${names.length - 1} more`
}

function draftTotal(draft: DraftPRType): number {
  return draft.items.reduce((sum, item) => sum + (item.qty ?? 0) * (item.unit_price ?? 0), 0)
}

function lastSavedAt(draft: DraftPRType): string {
  return formatDatePR_ISO(draft.updated_at ?? draft.created_at)
}

function onResume(draftId: number) {
  emit('resume', draftId)
  emit('update:modelValue', false)
}

async function onDelete(draft: DraftPRType) {
  const ok = await confirmDialog(
    `Delete draft #${draft.id}? Everything entered on it will be lost.`,
    { title: 'Delete draft requisition', confirmText: 'Delete', cancelText: 'Cancel' },
  )
  if (ok) emit('delete', draft.id)
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="640"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center pa-4">
        <v-icon icon="mdi-content-save-outline" color="primary" class="mr-2" />
        <span class="text-h6 font-weight-bold">Saved Drafts</span>
        <v-spacer />
        <v-btn
          icon="mdi-close"
          variant="text"
          size="small"
          @click="emit('update:modelValue', false)"
        />
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-0" style="max-height: 420px">
        <v-skeleton-loader v-if="props.loading" type="list-item-two-line@3" />

        <v-list v-else-if="drafts.length" density="comfortable">
          <v-list-item v-for="draft in drafts" :key="draft.id">
            <v-list-item-title class="font-weight-medium text-body-2">
              {{ draftSummary(draft) }}
            </v-list-item-title>
            <v-list-item-subtitle class="text-caption">
              Draft #{{ draft.id }} ·
              {{ draft.items.length }} line {{ draft.items.length === 1 ? 'item' : 'items' }} ·
              {{ formatCurrency(draftTotal(draft)) }} · saved {{ lastSavedAt(draft) }}
            </v-list-item-subtitle>

            <template #append>
              <div class="d-flex align-center ga-2">
                <v-btn
                  variant="outlined"
                  size="small"
                  class="text-none"
                  @click="onResume(draft.id)"
                >
                  Resume
                </v-btn>
                <v-tooltip location="top" text="Delete draft">
                  <template #activator="{ props: tooltipProps }">
                    <v-btn
                      v-bind="tooltipProps"
                      icon="mdi-delete-outline"
                      variant="text"
                      size="small"
                      color="error"
                      aria-label="Delete draft"
                      @click="onDelete(draft)"
                    />
                  </template>
                </v-tooltip>
              </div>
            </template>
          </v-list-item>
        </v-list>

        <v-empty-state
          v-else
          icon="mdi-content-save-outline"
          title="No saved drafts"
          text="Use Save as Draft on a purchase requisition to keep a half-finished one here."
        />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
