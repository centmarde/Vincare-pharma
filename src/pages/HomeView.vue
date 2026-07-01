<script setup lang="ts">
import { useAuthUserStore } from '@/stores/authUser'
import { useToast } from 'vue-toastification'
import { storeToRefs } from 'pinia'
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import HomeLogs from '@/pages/hometab/HomeLogs.vue'
import HomeAnnouncements from '@/pages/hometab/HomeAnnouncements.vue'

const authStore = useAuthUserStore()
const toast = useToast()

// Reactive references from the auth store
const { userName, loading, userRole } = storeToRefs(authStore)

const handleLogout = async () => {
  try {
    const result = await authStore.signOut()

    if (result.error) {
      toast.error('Logout failed: ' + result.error.message)
    } else {
      toast.success('You have been logged out successfully')
    }
  } catch (error) {
    console.error('Logout error:', error)
    toast.error('An unexpected error occurred during logout')
  }
}
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid class="pa-0">
        <!-- Role 3 Notice -->
        >
        <div style="margin-top: 1rem"></div>
        <v-alert v-if="userRole === 3" type="info" prominent border="start" class="mb-8 mx-4">
          <div class="text-body-1">
            <strong>Welcome to Vincare Pharma!</strong><br />
            Please contact the administrator for role requests and access permissions.
          </div>
        </v-alert>

        <!-- Announcements Carousel Section -->
        <section class="announcements-section mb-8">
          <v-container>
            <HomeAnnouncements />
          </v-container>
        </section>

        <!-- Divider -->
        <v-divider class="mx-4 mb-8" />

        <!-- Logs Section -->
        <section class="logs-section">
          <v-container fluid class="px-2 px-sm-4 px-md-12">
            <v-row justify="center" align="center" no-gutters>
              <v-col cols="12" sm="12" md="12" lg="12" xl="12">
                <HomeLogs />
              </v-col>
            </v-row>
          </v-container>
        </section>
      </v-container>
    </template>
  </InnerLayoutWrapper>
</template>
