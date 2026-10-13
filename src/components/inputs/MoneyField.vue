<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useToast } from 'vue-toastification'
import {
  caretAfterMoneyChars,
  countMoneyChars,
  formatMoneyInput,
  groupThousands,
  looksNegative,
  parseMoneyInput,
  sanitizeMoneyInput,
} from '@/utils/moneyInput'

// A peso amount input that shows thousands separators while you type
// ("100000" reads as "100,000") and pads to two decimals once you leave it.
// The v-model stays a plain number, so totals and validation are unaffected.
// Every other attribute (label, density, variant, hide-details, ...) passes
// straight through to the v-text-field.
defineOptions({ inheritAttrs: false })

const model = defineModel<number>({ default: 0 })

const text = ref(formatMoneyInput(model.value))
const focused = ref(false)
// Set when a negative amount was refused; the field shows red until the next
// accepted keystroke.
const refusedNegative = ref(false)
const toast = useToast()

// Follow changes made from outside: a reset, a restored draft, or this column
// being zeroed because the other one was filled. The field's own typing already
// matches the model, so it is left alone.
watch(model, (value) => {
  if (parseMoneyInput(text.value) === (value ?? 0)) return
  text.value = focused.value
    ? groupThousands(sanitizeMoneyInput(String(value ?? '')))
    : formatMoneyInput(value)
})

function onInput(event: Event) {
  const input = event.target as HTMLInputElement
  const raw = input.value

  // Refused, not stripped: "-500" read as 500 would post the amount on the
  // wrong side. The field keeps what it had.
  if (looksNegative(raw)) {
    input.value = text.value
    refusedNegative.value = true
    toast.warning('Negative amounts are not accepted. To reverse a side, enter the amount in the other column.')
    return
  }
  refusedNegative.value = false
  const charsBeforeCaret = countMoneyChars(raw, input.selectionStart ?? raw.length)
  const formatted = groupThousands(sanitizeMoneyInput(raw))

  text.value = formatted
  // Written to the element as well: when a rejected key (a letter, a second
  // point) leaves the formatted text unchanged, Vue sees nothing to update and
  // the stray character would stay on screen.
  input.value = formatted
  model.value = parseMoneyInput(formatted)

  // Re-inserting commas shifts the text under the caret; put the caret back
  // after the same digit the user was typing at.
  const caret = caretAfterMoneyChars(formatted, charsBeforeCaret)
  void nextTick(() => input.setSelectionRange(caret, caret))
}

// Present only to make the v-text-field CONTROLLED. Vuetify keeps its own copy
// of the raw keystrokes unless the parent listens for updates, and puts that
// copy back on its next re-render — so a refused "-500" reappeared the moment
// the field turned red. Typing is handled in onInput; this has nothing to do.
function keepControlled() {}

function onFocusChange(isFocused: boolean) {
  focused.value = isFocused
  if (!isFocused) text.value = formatMoneyInput(model.value)
}
</script>

<template>
  <v-text-field
    v-bind="$attrs"
    :model-value="text"
    :error="refusedNegative"
    @update:model-value="keepControlled"
    class="money-field"
    inputmode="decimal"
    autocomplete="off"
    placeholder="0.00"
    @input="onInput"
    @update:focused="onFocusChange"
  />
</template>

<style scoped>
.money-field :deep(input) {
  text-align: right;
}
</style>
