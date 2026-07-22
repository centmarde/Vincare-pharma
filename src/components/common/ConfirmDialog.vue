<script setup lang="ts">
import { useConfirmDialog } from '@/composables/useConfirmDialog'

const { isOpen, title, message, confirmText, cancelText, inputValue, inputLabel, resolve } = useConfirmDialog()
</script>

<template>
  <v-dialog v-model="isOpen" max-width="420" persistent>
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center pa-4">
        <v-icon icon="mdi-help-circle" class="mr-2" color="warning" />
        <span class="text-h6 font-weight-bold">{{ title }}</span>
      </v-card-title>
      <v-divider />
      <v-card-text class="pa-4" style="white-space: pre-line">
        {{ message }}
        <v-text-field
          v-if="inputLabel"
          v-model="inputValue"
          :label="inputLabel"
          variant="outlined"
          density="compact"
          class="mt-3"
          hide-details
        />
      </v-card-text>
      <v-divider />
      <v-card-actions class="px-4 py-3">
        <v-spacer />
        <v-btn variant="text" color="grey" @click="resolve(false)">{{ cancelText }}</v-btn>
        <v-btn variant="flat" color="primary" @click="resolve(true)">{{ confirmText }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>