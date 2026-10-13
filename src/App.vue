<script lang="ts" setup>
import { onMounted } from 'vue'
import { useTheme } from '@/stores/useTheme'
import IssueListDialog from '@/components/common/IssueListDialog.vue'

const themeStore = useTheme()

onMounted(async () => {
  await themeStore.initializeTheme()
})
</script>

<template>
  <v-app>
    <router-view />
    <ConfirmDialog />
    <IssueListDialog />
  </v-app>
</template>
