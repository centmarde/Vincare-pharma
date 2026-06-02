<script setup lang="ts">
import { useAdminUserRoles } from './composables/adminUserRoles'
import InnerLayoutWrapper from '@/layouts/InnerLayoutWrapper.vue'
import AdminUserRolesDialog from './dialogs/AdminUserRolesDialog.vue'

const {
  // Store state
  roles,
  loading,
  error,

  // Local state
  isDialogOpen,
  isDeleteDialogOpen,
  isEditing,
  selectedRole,
  searchQuery,
  formData,

  // Computed
  filteredRoles,
  isFormValid,

  // Actions
  openCreateDialog,
  openEditDialog,
  openDeleteDialog,
  closeDialog,
  handleSubmit,
  handleDelete,
  refreshRoles,
  clearError
} = useAdminUserRoles()

// Format date helper
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<template>
  <InnerLayoutWrapper>
    <template #content>
      <v-container fluid class="pa-6">
        <div class="my-5">

        </div>
    <!-- Header Section -->
    <v-row class="mb-6">
      <v-col cols="12">
        <div class="d-flex justify-space-between align-center">
          <div>
            <h1 class="text-h4 font-weight-bold mb-2">User Roles Management</h1>
            <p class="text-body-1 text-grey-darken-1">
              Manage system roles and permissions
            </p>
          </div>

        </div>
      </v-col>
    </v-row>

    <!-- Error Alert -->
    <v-row v-if="error">
      <v-col cols="12">
        <v-alert
          type="error"
          variant="tonal"
          closable
          @click:close="clearError"
          class="mb-4"
        >
          {{ error }}
        </v-alert>
      </v-col>
    </v-row>

    <!-- Search and Filter Section -->
    <v-row class="mb-4">
      <v-col cols="12" md="6">

      </v-col>
      <v-col cols="12" md="6" class="d-flex justify-end align-center">
        <v-btn
          variant="outlined"
          prepend-icon="mdi-refresh"
          @click="refreshRoles"
          :loading="loading"
        >
          Refresh
        </v-btn>
      </v-col>
    </v-row>

    <!-- Roles Grid -->
    <v-row>
      <!-- Existing Roles -->
      <v-col
        v-for="role in filteredRoles"
        :key="role.id"
        cols="12"
        sm="6"
        md="4"
        lg="3"
      >
        <v-card
          class="mx-auto"
          elevation="2"
          :loading="loading"
        >
          <v-card-text class="pa-4">
            <div class="d-flex align-center justify-space-between mb-3">
              <v-avatar size="40" color="primary">
                <v-icon color="white">mdi-account-group</v-icon>
              </v-avatar>
              <div class="d-flex ga-1">
                <v-btn
                  icon
                  size="small"
                  variant="text"
                  color="primary"
                  @click="openEditDialog(role)"
                  :loading="loading"
                >
                  <v-icon>mdi-pencil</v-icon>
                </v-btn>
                <v-btn
                  icon
                  size="small"
                  variant="text"
                  color="error"
                  @click="openDeleteDialog(role)"
                  :loading="loading"
                >
                  <v-icon>mdi-delete</v-icon>
                </v-btn>
              </div>
            </div>

            <h3 class="text-h6 font-weight-medium mb-2">
              {{ role.title || 'Untitled Role' }}
            </h3>

            <div class="d-flex align-center text-body-2 text-grey-darken-1">
              <v-icon size="16" class="mr-1">mdi-calendar</v-icon>
              {{ formatDate(role.created_at) }}
            </div>

            <div class="d-flex align-center text-body-2 text-grey-darken-1 my-3">

            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- Add New Role Card -->
      <v-col
        cols="12"
        sm="6"
        md="4"
        lg="3"
      >
        <v-card
          class="mx-auto"
          elevation="2"
          variant="outlined"
          @click="openCreateDialog"
          :loading="loading"
          style="cursor: pointer; border-style: dashed;"
        >
          <v-card-text class="pa-4">
            <div class="d-flex align-center justify-space-between mb-3">
              <v-avatar size="40" color="primary" variant="outlined">
                <v-icon color="primary">mdi-plus</v-icon>
              </v-avatar>
              <div class="d-flex ga-1">
                <!-- Empty space to maintain layout consistency -->
              </div>
            </div>

            <h3 class="text-h6 font-weight-medium mb-2 text-primary">
              Add New Role
            </h3>

            <div class="d-flex align-center text-body-2 text-grey-darken-1">
              <v-icon size="16" class="mr-1">mdi-plus-circle</v-icon>
              Click to create new role
            </div>

            <div class="d-flex align-center text-body-2 text-grey-darken-1 mt-1">
              <v-icon size="16" class="mr-1">mdi-account-plus</v-icon>
              Create role
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Empty State (when no roles and no search) -->
    <v-row v-if="filteredRoles.length === 0 && !searchQuery">
      <v-col cols="12">
        <div class="text-center py-12">
          <v-icon size="96" color="grey-lighten-1" class="mb-4">
            mdi-account-group-outline
          </v-icon>
          <h3 class="text-h4 mb-3">No roles found</h3>
          <p class="text-body-1 text-grey-darken-1 mb-6">
            Get started by creating your first role
          </p>
          <v-btn
            color="primary"
            size="large"
            prepend-icon="mdi-plus"
            @click="openCreateDialog"
          >
            Create First Role
          </v-btn>
        </div>
      </v-col>
    </v-row>

    <!-- No Search Results -->
    <v-row v-if="filteredRoles.length === 0 && searchQuery">
      <v-col cols="12">
        <div class="text-center py-12">
          <v-icon size="96" color="grey-lighten-1" class="mb-4">
            mdi-magnify
          </v-icon>
          <h3 class="text-h5 mb-3">No roles match your search</h3>
          <p class="text-body-1 text-grey-darken-1 mb-6">
            Try adjusting your search criteria or create a new role
          </p>
          <div class="d-flex justify-center ga-3">
            <v-btn
              variant="outlined"
              @click="searchQuery = ''"
            >
              Clear Search
            </v-btn>
            <v-btn
              color="primary"
              prepend-icon="mdi-plus"
              @click="openCreateDialog"
            >
              Create New Role
            </v-btn>
          </div>
        </div>
      </v-col>
    </v-row>

    <!-- Admin User Roles Dialogs -->
    <AdminUserRolesDialog
      :is-dialog-open="isDialogOpen"
      :is-delete-dialog-open="isDeleteDialogOpen"
      :is-editing="isEditing"
      :selected-role="selectedRole"
      :form-data="formData"
      :loading="loading"
      :is-form-valid="isFormValid"
      @close-dialog="closeDialog"
      @handle-submit="handleSubmit"
      @handle-delete="handleDelete"
      @update:form-data="(data) => { formData.title = data.title }"
    />
  </v-container>
    </template>
  </InnerLayoutWrapper>
</template>

<style scoped>
.v-card {
  transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
}

.v-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
}

.v-card[style*="cursor: pointer"]:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15) !important;
}

.v-card[style*="border-style: dashed"] {
  border-width: 2px;
  background: rgba(var(--v-theme-surface), 0.5);
}

.v-card[style*="border-style: dashed"]:hover {
  background: rgba(var(--v-theme-primary), 0.05);
  border-color: rgb(var(--v-theme-primary));
}
</style>
