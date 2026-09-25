<script setup lang="ts">
import { formatExpiryMonthYear, maskMonthYearInput, parseMonthYear } from '@/utils/helpers'
import { computed, ref } from 'vue'
import { useToast } from 'vue-toastification'

defineProps<{
  prependInnerIcon?: string
}>()

const expiryDate = defineModel<Date | null>({ required: true })

const toast = useToast()

const earliestExpiryYear = 2000
const latestExpiryYear = 2099
const earliestExpiryDate = `${earliestExpiryYear}-01-01`
const latestExpiryDate = `${latestExpiryYear}-12-31`

const menuOpen = ref(false)
const pickerYear = ref(new Date().getFullYear())
const pickerView = ref<'months' | 'year'>('months')
const pickedMonth = ref<number | null>(null)
const yearPicked = ref(false)
const typedText = ref<string | null>(null)

const fieldText = computed(() => {
  if (typedText.value !== null) return typedText.value
  return expiryDate.value ? formatExpiryMonthYear(expiryDate.value) : ''
})

function parseExpiryText(text: string): Date | null {
  const date = parseMonthYear(text)
  if (!date) return null
  const year = date.getFullYear()
  if (year < earliestExpiryYear || year > latestExpiryYear) return null
  return date
}

function setExpiryMonth(year: number, monthIndex: number) {
  const lastDayOfMonth = new Date(year, monthIndex + 1, 0)
  expiryDate.value = lastDayOfMonth
  pickerYear.value = year
}

function startTyping() {
  typedText.value = expiryDate.value ? formatExpiryMonthYear(expiryDate.value) : ''
}

function onTyped(raw: string) {
  const text = maskMonthYearInput(raw)
  typedText.value = text
  const date = parseExpiryText(text)
  if (date) setExpiryMonth(date.getFullYear(), date.getMonth())
}

function finishTyping() {
  if (typedText.value === null) return
  const text = typedText.value
  typedText.value = null
  if (!text) {
    expiryDate.value = null
    return
  }
  if (!parseExpiryText(text)) toast.info('Enter a valid expiry as MM/YYYY, e.g. 01/2029.')
}

function onMenuToggle(isOpen: boolean) {
  menuOpen.value = isOpen
  if (!isOpen) return
  pickerYear.value = expiryDate.value ? expiryDate.value.getFullYear() : new Date().getFullYear()
  pickerView.value = 'months'
  pickedMonth.value = null
  yearPicked.value = false
}

function onViewChange(mode: string) {
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
        :model-value="fieldText"
        placeholder="MM/YYYY"
        autocomplete="off"
        maxlength="7"
        inputmode="numeric"
        variant="outlined"
        density="compact"
        hide-details
        :prepend-inner-icon="prependInnerIcon"
        @focus="startTyping"
        @update:model-value="onTyped"
        @blur="finishTyping"
      />
    </template>
    <v-date-picker
      :model-value="expiryDate"
      :year="pickerYear"
      :view-mode="pickerView"
      :min="earliestExpiryDate"
      :max="latestExpiryDate"
      @update:view-mode="onViewChange"
      @update:month="onMonthSelect"
    >
      <template #year="{ year, props: yearButtonProps }">
        <v-btn :key="year.value" v-bind="yearButtonProps" @click="onYearSelect(year.value)" />
      </template>
    </v-date-picker>
  </v-menu>
</template>
