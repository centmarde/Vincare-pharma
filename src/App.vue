<script lang="ts" setup>
import { onMounted, ref } from 'vue'
import { useTheme } from '@/stores/useTheme'
import IssueListDialog from '@/components/common/IssueListDialog.vue'
import OutOfServices from '@/components/common/OutOfServices.vue'
import { useLandingController } from '@/controller/landingController'

const themeStore = useTheme()
const { data, fetchLandingData } = useLandingController()

// Out-of-service toggler nga gikontrol sa external-page.json.
// null = checking pa (para walay flash sa whole app), true = OutOfServices ra ang i-show,
// false = normal nga app nga naay router ug dialogs.
const outOfService = ref<boolean | null>(null)

onMounted(async () => {
  await themeStore.initializeTheme()
  await fetchLandingData()
  outOfService.value = data.value?.outOfService?.enabled ?? false
})
</script>

<template>
  <v-app>
    <!-- Kung out of service, ang OutOfServices ra gyud ang i-display ug ma-detach ang tanang components -->
    <template v-if="outOfService === true">
      <OutOfServices :model-value="true" />
    </template>

    <!-- Normal nga app (kung wala'y out of service mode) -->
    <template v-else-if="outOfService === false">
      <router-view />
      <ConfirmDialog />
      <IssueListDialog />
    </template>

    <!-- Blank sa meanwhile nga nag-load pa ang config para walay flash sa tanang components -->
  </v-app>
</template>
