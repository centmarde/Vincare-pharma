<script setup lang="ts">
import { useToast } from 'vue-toastification'
import { ref } from 'vue'
import type { PRItem } from '@/stores/purchaseRequisitionData'
import {
  formatExpiryMonthYear,
  fromLocalISODate,
  maskMonthYearInput,
  parseMonthYear,
} from '@/utils/helpers'

// Self-contained expiry field (MM/YYYY) + month/year picker menu.
// Owns its own picker/menu state and writes the expiry into the (reactive)
// store `item` — kinahanglan nga match sa old expiry logic sa parent.
const props = defineProps<{
  item: PRItem
  width?: string
}>()

const toast = useToast()

const menuOpen = ref(false)
const pickerYear = ref(new Date().getFullYear())
const pickerView = ref<'months' | 'year'>('months')
const pickedMonth = ref<number | null>(null)
const yearPicked = ref(false)
const editingText = ref<string | null>(null)

const earliestExpiryYear = 2000
const latestExpiryYear = 2099
const earliestExpiryDate = `${earliestExpiryYear}-01-01`
const latestExpiryDate = `${latestExpiryYear}-12-31`

function parseExpiryText(text: string): Date | null {
  const date = parseMonthYear(text)
  if (!date) return null
  const year = date.getFullYear()
  if (year < earliestExpiryYear || year > latestExpiryYear) return null
  return date
}

function expiryDateOf(): Date | null {
  return props.item.expiry_date ? fromLocalISODate(props.item.expiry_date) : null
}

// Text shown in the expiry field. Empty returns '' so the MM/YYYY
// placeholder is visible, otherwise renders as MM/YYYY (e.g. "09/2031").
function expiryFieldText(): string {
  if (editingText.value !== null) return editingText.value
  const date = expiryDateOf()
  return date ? formatExpiryMonthYear(date) : ''
}

// Build a local-timezone-safe "YYYY-MM-DD" string for the last day of the
// selected month (the same expiry storage convention used elsewhere in the app).
function expiryDateString(year: number, month0: number): string {
  const lastDay = new Date(year, month0 + 1, 0).getDate()
  return `${year}-${String(month0 + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

function setExpiryMonth(year: number, monthIndex: number) {
  props.item.expiry_date = expiryDateString(year, monthIndex)
  pickerYear.value = year
}

function startTyping() {
  const date = expiryDateOf()
  editingText.value = date ? formatExpiryMonthYear(date) : ''
}

function onTyped(raw: string) {
  const text = maskMonthYearInput(raw)
  editingText.value = text
  const date = parseExpiryText(text)
  if (date) setExpiryMonth(date.getFullYear(), date.getMonth())
}

function finishTyping() {
  if (editingText.value === null) return
  const text = editingText.value
  editingText.value = null
  if (!text) {
    props.item.expiry_date = null
    return
  }
  if (!parseExpiryText(text)) toast.info('Enter a valid expiry as MM/YYYY, e.g. 01/2029.')
}

function onMenuToggle(isOpen: boolean) {
  menuOpen.value = isOpen
  if (!isOpen) return
  pickerYear.value = expiryDateOf()?.getFullYear() ?? new Date().getFullYear()
  pickerView.value = 'months'
  pickedMonth.value = null
  yearPicked.value = false
}

function onPickerViewChange(mode: string) {
  if (mode === 'months' || mode === 'year') pickerView.value = mode
}

function completePick(year: number, month: number) {
  setExpiryMonth(year, month)
  menuOpen.value = false
}

function onMonthSelect(month: number) {
  if (yearPicked.value) {
    completePick(pickerYear.value, month)
    return
  }
  pickedMonth.value = month
  pickerView.value = 'year'
}

function onYearSelect(year: number) {
  pickerYear.value = year
  if (pickedMonth.value != null) {
    completePick(year, pickedMonth.value)
    return
  }
  yearPicked.value = true
  pickerView.value = 'months'
}
</script>

<template>
  <v-menu
    :model-value="menuOpen"
    @update:model-value="onMenuToggle"
    :close-on-content-click="false"
    location="bottom"
  >
    <template #activator="{ props: menuProps }">
      <v-text-field
        v-bind="menuProps"
        :model-value="expiryFieldText()"
        placeholder="MM/YYYY"
        maxlength="7"
        inputmode="numeric"
        density="compact"
        variant="outlined"
        hide-details
        autocomplete="off"
        prepend-inner-icon="mdi-calendar-month-outline"
        :style="width ? `width: ${width}` : undefined"
        @focus="startTyping"
        @update:model-value="onTyped"
        @blur="finishTyping"
      />
    </template>
    <v-date-picker
      :model-value="expiryDateOf()"
      :year="pickerYear"
      :view-mode="pickerView"
      :min="earliestExpiryDate"
      :max="latestExpiryDate"
      @update:view-mode="onPickerViewChange"
      @update:month="onMonthSelect"
    >
      <template #year="{ year, props: yearButtonProps }">
        <v-btn :key="year.value" v-bind="yearButtonProps" @click="onYearSelect(year.value)" />
      </template>
    </v-date-picker>
  </v-menu>
</template>
