<script setup lang="ts">
import { onMounted } from 'vue'
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import UserManagementTable from './components/UserManagementTable.vue'
</script>
<template>
  <InnerLayoutWrapper>
    <template #content>
			<v-container fluid class="px-2 px-sm-4 px-md-6">
 <UserManagementTable />
			</v-container>

    </template>
  </InnerLayoutWrapper>
</template>
