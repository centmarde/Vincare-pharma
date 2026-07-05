<script setup lang="ts">
import { onMounted } from 'vue'
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import UserManagementTable from './components/UserManagementTable.vue'
</script>
<template>
  <InnerLayoutWrapper>
    <template #content>
			<v-container fluid>
 <UserManagementTable />
			</v-container>

    </template>
  </InnerLayoutWrapper>
</template>
