<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import type { Role, CreateRoleData } from '@/stores/roles'
import {
  getNavigationWithSelection,
  getAllPermissions,
  isSelectableNavigationItem,
  type SelectableNavigationChild,
} from '@/utils/navigation'
import { useRoleEditFetchDialog } from '../composables/roleEditFetchDialog'
import { isProtectedRoleObject } from '@/utils/roleHelpers'

interface Props {
  // Dialog state
  isDialogOpen: boolean
  isDeleteDialogOpen: boolean
  isEditing: boolean
  selectedRole: Role | null
  formData: CreateRoleData
  loading: boolean

  // Computed
  isFormValid: boolean
}

interface Emits {
  (e: 'close-dialog'): void
  (e: 'handle-submit', selectedPermissions: string[]): void
  (e: 'handle-delete'): void
  (e: 'update:formData', value: CreateRoleData): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

// Use the role edit fetch composable
const {
  currentRolePermissions,
  loading: permissionsLoading,
  fetchRolePermissions,
  saveRolePermissions,
  hasPermission,
  clearPermissions,
} = useRoleEditFetchDialog()

// Local reactive form data
const localFormData = computed({
  get: () => props.formData,
  set: (value) => emit('update:formData', value),
})

// Page control data - dynamically generated from navigation config.
// Expansion state per group/sub-group title, all expanded by default.
// Keyed by a single reactive map (not one ref per title) so toggling a
// title always reads/writes the same ref instance — returning a fresh
// `ref(true)` per call (the old approach for any unlisted title) meant a
// toggle's write and the template's read landed on different refs, so the
// section never actually stayed open/closed and just flickered.
const groupExpansion = ref<Record<string, boolean>>({})

// Selected permissions for the role - initialized from current role permissions when editing
const selectedPermissions = ref<string[]>([])

// Watch for changes in selectedRole to fetch permissions when editing
watch(
  () => props.selectedRole,
  async (newRole) => {
    if (newRole && props.isEditing) {
      // Fetch current permissions for the role
      await fetchRolePermissions(newRole.id)
      // Set selected permissions to current role permissions
      selectedPermissions.value = [...currentRolePermissions.value]
    } else {
      // Clear permissions when creating new role or closing dialog
      selectedPermissions.value = []
      clearPermissions()
    }
  },
  { immediate: true },
)

// Watch for dialog open/close to reset permissions
watch(
  () => props.isDialogOpen,
  (isOpen) => {
    if (!isOpen) {
      selectedPermissions.value = []
      clearPermissions()
    }
  },
)

// Get navigation groups with selection state
const navigationGroups = computed(() => getNavigationWithSelection(selectedPermissions.value))

// Whether a group/sub-group is expanded — defaults to true until toggled.
const isGroupExpanded = (groupTitle: string) => groupExpansion.value[groupTitle] ?? true

const toggleGroupExpanded = (groupTitle: string) => {
  groupExpansion.value[groupTitle] = !isGroupExpanded(groupTitle)
}

// Handle permission toggle
const togglePermission = (permission: string, selected: boolean) => {
  if (selected) {
    if (!selectedPermissions.value.includes(permission)) {
      selectedPermissions.value.push(permission)
    }
  } else {
    const index = selectedPermissions.value.indexOf(permission)
    if (index > -1) {
      selectedPermissions.value.splice(index, 1)
    }
  }
}

// A sub-group (e.g. "Income Statement Controls") is rendered in this dialog
// as a single bundle checkbox rather than its individual pages — checking it
// grants every page nested inside in one action.
type SelectableSubGroup = Extract<SelectableNavigationChild, { children: SelectableNavigationChild[] }>

const subgroupLeaves = (child: SelectableSubGroup) => child.children.filter(isSelectableNavigationItem)

const isSubgroupFullySelected = (child: SelectableSubGroup) => {
  const leaves = subgroupLeaves(child)
  return leaves.length > 0 && leaves.every((item) => item.selected)
}

const isSubgroupPartiallySelected = (child: SelectableSubGroup) => {
  const leaves = subgroupLeaves(child)
  const selectedCount = leaves.filter((item) => item.selected).length
  return selectedCount > 0 && selectedCount < leaves.length
}

const toggleSubgroup = (child: SelectableSubGroup, value: boolean) => {
  subgroupLeaves(child).forEach((item) => togglePermission(item.permission || item.route, value))
}

const closeDialog = () => {
  emit('close-dialog')
}

const handleSubmit = async () => {
  // For editing, let the parent handle both role update and permission saving
  // For creating, just emit the permissions to be saved after role creation
  emit('handle-submit', selectedPermissions.value)
}

const handleDelete = () => {
  emit('handle-delete')
}
</script>

<template>
  <!-- Create/Edit Dialog -->
  <v-dialog
    :model-value="isDialogOpen"
    max-width="800px"
    persistent
    @update:model-value="!$event && closeDialog()"
  >
    <v-card>
      <v-card-title class="text-h5 pa-6 pb-4">
        {{ isEditing ? 'Edit Role' : 'Create New Role' }}
      </v-card-title>

      <v-card-text class="pa-6 pt-0">
        <v-row>
          <!-- Role Information Column -->
          <v-col cols="12" md="6">
            <h3 class="text-h6 mb-4">Role Information</h3>
            <v-form @submit.prevent="handleSubmit">
              <!-- Protected roles (id 1, 2, 3): show read-only display with lock icon -->
              <div v-if="isEditing && isProtectedRoleObject(selectedRole)">
                <v-text-field
                  :model-value="selectedRole?.title"
                  label="Role Title"
                  variant="outlined"
                  readonly
                  disabled
                  prepend-inner-icon="mdi-shield-lock"
                />
                <v-alert
                  type="info"
                  variant="tonal"
                  density="compact"
                  class="mt-2"
                  icon="mdi-information"
                >
                  This is a system role and its title cannot be modified.
                </v-alert>
              </div>
              <!-- Editable title for non-protected or new roles -->
              <v-text-field
                v-else
                v-model="localFormData.title"
                label="Role Title *"
                variant="outlined"
                :rules="[(v) => !!v || 'Role title is required']"
                required
                autofocus
              />
            </v-form>
          </v-col>

          <!-- Page Access Control Column -->
          <v-col cols="12" md="6">
            <h3 class="text-h6 mb-4">Page Access Control</h3>
            <div class="page-control-container">
              <!-- Loading state for permissions -->
              <div v-if="permissionsLoading" class="text-center py-6">
                <v-progress-circular indeterminate color="primary" size="32" />
                <p class="text-body-2 mt-2">Loading role permissions...</p>
              </div>

              <!-- Dynamic Navigation Groups -->
              <div
                v-else
                v-for="group in navigationGroups"
                :key="group.title"
                class="navigation-group-section mb-4"
              >
                <!-- Group Header -->
                <v-list-item
                  @click="toggleGroupExpanded(group.title)"
                  class="mb-1 rounded-lg group-header pa-2"
                  :prepend-icon="group.icon"
                  :append-icon="isGroupExpanded(group.title) ? 'mdi-chevron-up' : 'mdi-chevron-down'"
                  density="compact"
                >
                  <v-list-item-title class="font-weight-medium text-body-2">
                    {{ group.title }}
                  </v-list-item-title>
                </v-list-item>

                <!-- Collapsible Children -->
                <v-expand-transition>
                  <div v-show="isGroupExpanded(group.title)" class="group-children">
                    <template v-for="child in group.children" :key="child.title">
                      <!-- Leaf item: a checkable permission -->
                      <v-list-item
                        v-if="isSelectableNavigationItem(child)"
                        class="mb-1 rounded-lg ml-4 pa-1"
                        density="compact"
                      >
                        <template #prepend>
                          <v-checkbox
                            :model-value="child.selected"
                            @update:model-value="
                              (value) => togglePermission(child.permission || child.route, !!value)
                            "
                            hide-details
                            density="compact"
                            class="mr-2"
                            :disabled="!(child.permission || child.route)"
                          />
                          <v-icon :icon="child.icon" size="20" class="mr-2" />
                        </template>
                        <v-list-item-title class="text-body-2">
                          {{ child.title }}
                        </v-list-item-title>
                        <v-list-item-subtitle class="text-caption" v-if="child.route">
                          {{ child.route }}
                        </v-list-item-subtitle>
                      </v-list-item>

                      <!-- Sub-group: bundled into a single checkbox — checking it grants
                           every page nested inside, no per-page breakdown shown -->
                      <v-list-item v-else class="mb-1 rounded-lg ml-4 pa-1" density="compact">
                        <template #prepend>
                          <v-checkbox
                            :model-value="isSubgroupFullySelected(child)"
                            :indeterminate="isSubgroupPartiallySelected(child)"
                            @update:model-value="(value) => toggleSubgroup(child, !!value)"
                            hide-details
                            density="compact"
                            class="mr-2"
                          />
                          <v-icon :icon="child.icon" size="20" class="mr-2" />
                        </template>
                        <v-list-item-title class="text-body-2 font-weight-medium">
                          {{ child.title }}
                        </v-list-item-title>
                        <v-list-item-subtitle class="text-caption">
                          Includes {{ subgroupLeaves(child).length }} pages
                        </v-list-item-subtitle>
                      </v-list-item>
                    </template>
                  </div>
                </v-expand-transition>
              </div>
            </div>
          </v-col>
        </v-row>
      </v-card-text>

      <v-card-actions class="pa-6 pt-0">
        <v-spacer />
        <v-btn variant="text" @click="closeDialog" :disabled="loading"> Cancel </v-btn>
        <v-btn
          color="primary"
          @click="handleSubmit"
          :loading="loading || permissionsLoading"
          :disabled="!isFormValid"
        >
          {{ isEditing ? 'Update' : 'Create' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Delete Confirmation Dialog -->
  <v-dialog
    :model-value="isDeleteDialogOpen"
    max-width="400px"
    persistent
    @update:model-value="!$event && closeDialog()"
  >
    <v-card>
      <v-card-title class="text-h5 pa-6 pb-4"> Confirm Delete </v-card-title>

      <v-card-text class="pa-6 pt-0">
        <p class="text-body-1 mb-4">
          Are you sure you want to delete the role
          <strong>"{{ selectedRole?.title }}"</strong>?
        </p>
        <v-alert type="warning" variant="tonal" density="compact" class="mb-0">
          This action cannot be undone and will also delete all associated role pages.
        </v-alert>
      </v-card-text>

      <v-card-actions class="pa-6 pt-0">
        <v-spacer />
        <v-btn variant="text" @click="closeDialog" :disabled="loading"> Cancel </v-btn>
        <v-btn color="error" @click="handleDelete" :loading="loading"> Delete </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.page-control-container {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
  padding: 8px;
  background-color: rgba(var(--v-theme-surface), 0.5);
}

.rounded-lg {
  border-radius: 8px !important;
}

.group-header {
  background-color: rgba(var(--v-theme-surface), 0.8) !important;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid rgba(var(--v-border-color), 0.2);
}

.group-header:hover {
  background-color: rgba(var(--v-theme-primary), 0.08) !important;
}

.subgroup-header {
  background-color: transparent !important;
  cursor: pointer;
  opacity: 0.85;
}

.subgroup-header:hover {
  background-color: rgba(var(--v-theme-primary), 0.06) !important;
}

.subgroup-section {
  margin-bottom: 4px;
}

.admin-children,
.organization-children,
.group-children {
  background-color: rgba(0, 0, 0, 0.02);
  border-radius: 8px;
  padding: 4px 0;
  margin-top: 4px;
}

.admin-controls-section,
.organization-controls-section,
.navigation-group-section {
  margin-bottom: 8px;
}

.v-list-item {
  min-height: 32px !important;
}

.v-list-item-title {
  font-size: 0.875rem;
}

.v-checkbox {
  flex: 0 0 auto;
}
</style>
