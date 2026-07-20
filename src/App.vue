<template>
  <v-app>
    <router-view />
    <ConfirmDialog />
  </v-app>
</template>

<script lang="ts" setup>
import { onMounted } from 'vue'
import { useTheme } from '@/stores/useTheme'

const themeStore = useTheme()

onMounted(async () => {
  await themeStore.initializeTheme()
})
</script>
