<script setup lang="ts">
import { computed } from 'vue'
import type { VoucherType } from '@/stores/disbursementVouchersData'
import { useVoucherStamp } from '../../composables/useVoucherStamp'

const props = defineProps<{
  modelValue: boolean
  voucher: VoucherType | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const {
  stampArea, generating, offsetX, offsetY, leftMm, bottomMm,
  isRecorded, expenseNos, recordedDate,
  printStamp, resetCalibration,
} = useVoucherStamp(() => props.voucher)

// Only ever two or three numbers, but a long voucher shouldn't overflow the box.
const expenseLabel = computed(() =>
  expenseNos.value.length > 3
    ? `${expenseNos.value.slice(0, 3).join(', ')} +${expenseNos.value.length - 3}`
    : expenseNos.value.join(', '))
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="720"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-card-title class="pa-4 d-flex align-center ga-2">
        <v-icon icon="mdi-stamper" color="error" />
        <span class="text-h6 font-weight-bold">Mark Voucher as Recorded</span>
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-4">
        <v-alert
          v-if="!isRecorded"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-4"
        >
          This voucher has not been recorded yet. Record its expenses first — the
          stamp is a consequence of recording, never a substitute for it.
        </v-alert>

        <v-alert v-else type="info" variant="tonal" density="compact" class="mb-4">
          This prints the mark <strong>only</strong> — a page that is blank apart
          from the stamp. Put the signed voucher back through the printer
          (manual tray: the main cassette usually jams on printed stock).
          Run the alignment test on blank paper first.
        </v-alert>

        <div class="text-subtitle-2 font-weight-bold mb-2">Preview</div>
        <div class="preview-sheet mb-4">
          <div class="preview-stamp">
            <div class="dv-stamp">
              <div class="dv-stamp-word">RECORDED</div>
              <div class="dv-stamp-meta">{{ recordedDate || '—' }}</div>
              <div class="dv-stamp-meta">{{ expenseLabel || 'no expenses linked' }}</div>
            </div>
          </div>
        </div>

        <div class="text-subtitle-2 font-weight-bold mb-1">Printer calibration</div>
        <div class="text-caption text-medium-emphasis mb-3">
          Set once per printer. Positive right / up. Saved on this machine only.
        </div>
        <v-row dense>
          <v-col cols="6" sm="4">
            <v-text-field
              v-model.number="offsetX"
              type="number"
              step="0.5"
              label="Shift right (mm)"
              variant="outlined"
              density="compact"
              hide-details
            />
          </v-col>
          <v-col cols="6" sm="4">
            <v-text-field
              v-model.number="offsetY"
              type="number"
              step="0.5"
              label="Shift up (mm)"
              variant="outlined"
              density="compact"
              hide-details
            />
          </v-col>
          <v-col cols="12" sm="4" class="d-flex align-center">
            <v-btn variant="text" size="small" class="text-none" @click="resetCalibration">
              Reset to default
            </v-btn>
          </v-col>
        </v-row>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4">
        <v-btn
          variant="outlined"
          class="text-none"
          prepend-icon="mdi-ruler"
          :disabled="!isRecorded"
          :loading="generating"
          @click="printStamp(true)"
        >
          Alignment test
        </v-btn>

        <v-spacer />

        <v-btn variant="text" class="text-none" @click="emit('update:modelValue', false)">
          Close
        </v-btn>

        <v-btn
          color="error"
          variant="flat"
          class="text-none font-weight-bold"
          prepend-icon="mdi-stamper"
          :disabled="!isRecorded"
          :loading="generating"
          @click="printStamp(false)"
        >
          Print RECORDED mark
        </v-btn>
      </v-card-actions>
    </v-card>

    <!-- The actual print payload: a full A4 page that is empty except for the
         stamp. Kept off-screen rather than v-if'd so html2pdf always has a laid
         out element to rasterise. Height must be a real A4 or the mark lands at
         the top of the sheet instead of the bottom. -->
    <div class="stamp-offscreen">
      <div ref="stampArea" class="stamp-page">
        <div
          class="dv-stamp stamp-placed"
          :style="{ left: `${leftMm}mm`, bottom: `${bottomMm}mm` }"
        >
          <div class="dv-stamp-word">RECORDED</div>
          <div class="dv-stamp-meta">{{ recordedDate }}</div>
          <div class="dv-stamp-meta">{{ expenseLabel }}</div>
        </div>
      </div>
    </div>
  </v-dialog>
</template>

<style scoped>
/* Kept in the layout (not display:none) so html2canvas can measure it. */
.stamp-offscreen {
  position: fixed;
  left: -10000px;
  top: 0;
  width: 210mm;
}

.stamp-page {
  position: relative;
  width: 210mm;
  height: 297mm;
  background: transparent;
}

.stamp-placed {
  position: absolute;
}

/* The stamp itself. Deliberately unlike every other face on the document — a
   condensed letterspaced serif in a double rule, tilted, so it reads as applied
   after the fact rather than printed with the form. */
.dv-stamp {
  display: inline-block;
  padding: 3mm 5mm;
  border: 0.9mm solid #c62828;
  outline: 0.3mm solid #c62828;
  outline-offset: 1.1mm;
  border-radius: 1.5mm;
  color: #c62828;
  text-align: center;
  transform: rotate(-4deg);
  font-family: 'Times New Roman', 'Georgia', serif;
}

.dv-stamp-word {
  font-size: 7mm;
  font-weight: 700;
  letter-spacing: 2.2mm;
  /* letter-spacing adds a trailing gap; pull it back so the word looks centred */
  text-indent: 2.2mm;
  line-height: 1.1;
}

.dv-stamp-meta {
  font-size: 2.6mm;
  letter-spacing: 0.35mm;
  line-height: 1.5;
}

/* Preview only — a scaled-down corner of the sheet so placement is visible
   without printing. */
.preview-sheet {
  position: relative;
  height: 150px;
  border: 1px dashed rgba(var(--v-theme-on-surface), 0.3);
  border-radius: 4px;
  background: repeating-linear-gradient(
    45deg, transparent, transparent 6px,
    rgba(var(--v-theme-on-surface), 0.04) 6px,
    rgba(var(--v-theme-on-surface), 0.04) 12px
  );
  overflow: hidden;
}

.preview-stamp {
  position: absolute;
  left: 10px;
  bottom: 10px;
  transform: scale(0.85);
  transform-origin: bottom left;
}
</style>
