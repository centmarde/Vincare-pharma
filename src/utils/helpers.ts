/**
 * Utility functions for the application
 */

/**
 * Extracts a readable error message from various error formats
 * @param error - The error object to extract message from
 * @returns A human-readable error message string
 */
export function getErrorMessage(error: any): string {
  if (typeof error === 'string') {
    return error
  }
  if (error?.message) {
    return error.message
  }
  if (error?.msg) {
    return error.msg
  }
  return 'Unknown error occurred'
}

/**
 * Generates initials from an email address for avatar display
 * @param email - The email address to extract initials from
 * @returns A string of 1-2 uppercase letters representing the user's initials
 */
export function getEmailInitials(email: string | null | undefined): string {
  if (!email) return 'U'; // Default to 'U' for User if no email

  // Extract the local part (before @) from email
  const localPart = email.split('@')[0];

  // Split by common separators (dots, underscores, hyphens, numbers)
  const parts = localPart.split(/[\._\-\d]+/).filter(part => part.length > 0);

  if (parts.length >= 2) {
    // Take first letter of first two parts
    return (parts[0][0] + parts[1][0]).toUpperCase();
  } else if (parts.length === 1 && parts[0].length >= 2) {
    // Take first two letters of single part
    return (parts[0][0] + parts[0][1]).toUpperCase();
  } else if (parts.length === 1 && parts[0].length === 1) {
    // Single letter part
    return parts[0][0].toUpperCase();
  }

  // Fallback: take first letter of email
  return email[0].toUpperCase();
}

/**
 * Generates a display name from user data
 * @param userData - User data object containing name/email information
 * @returns A formatted display name
 */
export function getUserDisplayName(userData: {
  user_metadata?: { full_name?: string };
  email?: string
} | null): string {
  if (!userData) return 'User';

  const fullName = userData.user_metadata?.full_name;
  if (fullName) return fullName;

  if (userData.email) {
    // Extract name from email (part before @)
    const emailLocal = userData.email.split('@')[0];
    // Replace dots/underscores with spaces and capitalize
    return emailLocal.replace(/[\._]/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  return 'User';
}

/**
 * Gets the color associated with a role ID
 * @param roleId - The role ID to get color for
 * @returns A color string for Vuetify components
 */
export function getRoleColor(roleId: number | null | undefined): string {
  if (!roleId) return 'grey'
  // You can customize colors based on role ID or title
  switch (roleId) {
    case 1: return 'red' // Admin
    case 2: return 'blue' // Student
    case 3: return 'green' // Organization Leader
    default: return 'grey'
  }
}

/**
 * Gets the title of a role by looking it up in the roles array
 * @param roleId - The role ID to get title for
 * @param roles - The roles array to search in
 * @returns A human-readable role title
 */
export function getRoleTitle(roleId: number | null | undefined, roles: Array<{ id: number; title: string | null }>): string {
  if (!roleId) return 'Unknown'
  const role = roles.find(r => r.id === roleId)
  return role?.title || 'Unknown'
}

/**
 * Gets the text representation of a role ID
 * @param roleId - The role ID to get text for
 * @returns A human-readable role name
 */
export function getRoleText(roleId: number | null | undefined): string {
  switch (roleId) {
    case 1: return 'Admin'
    case 2: return 'Student'
    case 3: return 'Organization Leader'
    default: return 'Unknown'
  }
}





/**
 * Formats a date string into a human-readable format
 * @param dateString - The date string to format
 * @returns A formatted date string or 'N/A' if no date provided
 */
export function formatDate(dateString: string | undefined): string {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * Creates a slug name from an email address for display purposes
 * @param email - The email address to convert to slug name
 * @returns A formatted slug name string
 */
export function createSlugName(email: string | null | undefined): string {
  if (!email) return 'user';

  // Extract the local part (before @) from email
  const localPart = email.split('@')[0];

  // Replace dots, underscores, hyphens, and numbers with spaces
  const cleaned = localPart.replace(/[\._\-\d]+/g, ' ');

  // Split by spaces and filter out empty parts
  const parts = cleaned.split(' ').filter(part => part.length > 0);

  if (parts.length === 0) {
    // Fallback: use first part of email before @
    return localPart.toLowerCase();
  }

  // Join parts with dots to create slug-like name
  return parts.map(part => part.toLowerCase()).join('.');
}

/**
 * Creates a display slug name with proper capitalization from email
 * @param email - The email address to convert
 * @returns A capitalized display name
 */
export function createDisplaySlugName(email: string | null | undefined): string {
  if (!email) return 'User';

  const slugName = createSlugName(email);

  // Split by dots and capitalize each part
  return slugName
    .split('.')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}



// ========================================
// ORGANIZATION MEMBERS HELPERS
// ========================================

/**
 * Organization member management configuration
 */
export const memberStatusOptions = [
  { value: 'active', title: 'Active', color: 'success', icon: 'mdi-check-circle' },
  { value: 'pending', title: 'Pending', color: 'warning', icon: 'mdi-clock' },
  { value: 'inactive', title: 'Inactive', color: 'grey', icon: 'mdi-minus-circle' },
  { value: 'suspended', title: 'Suspended', color: 'error', icon: 'mdi-alert-circle' }
] as const

export const memberRoleOptions = [
  { value: 'member', title: 'Member', description: 'Regular organization member' },
  { value: 'officer', title: 'Officer', description: 'Organization officer with special responsibilities' },
  { value: 'secretary', title: 'Secretary', description: 'Handles documentation and communications' },
  { value: 'treasurer', title: 'Treasurer', description: 'Manages organization finances' },
  { value: 'vice_president', title: 'Vice President', description: 'Second-in-command of the organization' }
] as const

export type MemberStatus = typeof memberStatusOptions[number]['value']
export type MemberRole = typeof memberRoleOptions[number]['value']

/**
 * Gets the color for a member status
 */
export const getMemberStatusColor = (status: string): string => {
  const option = memberStatusOptions.find(opt => opt.value === status)
  return option?.color || 'grey'
}

/**
 * Gets the icon for a member status
 */
export const getMemberStatusIcon = (status: string): string => {
  const option = memberStatusOptions.find(opt => opt.value === status)
  return option?.icon || 'mdi-help-circle'
}

/**
 * Gets the title for a member role
 */
export const getMemberRoleTitle = (role: string): string => {
  const option = memberRoleOptions.find(opt => opt.value === role)
  return option?.title || role
}

/**
 * Gets the description for a member role
 */
export const getMemberRoleDescription = (role: string): string => {
  const option = memberRoleOptions.find(opt => opt.value === role)
  return option?.description || ''
}

/**
 * Validates if a member status is valid
 */
export const isValidMemberStatus = (status: string): status is MemberStatus => {
  return memberStatusOptions.some(opt => opt.value === status)
}

/**
 * Validates if a member role is valid
 */
export const isValidMemberRole = (role: string): role is MemberRole => {
  return memberRoleOptions.some(opt => opt.value === role)
}

// ========================================
// ORGANIZATION VIEW HELPERS
// ========================================

/**
 * Filters organizations by leader ID
 * @param organizations - Array of organizations
 * @param leaderId - ID of the leader to filter by
 * @returns Organizations where the user is the leader
 */
export const filterOrganizationsByLeader = (organizations: any[], leaderId: string | undefined): any[] => {
  if (!leaderId) return []
  return organizations.filter(org => org.leader_id === leaderId)
}

/**
 * Filters organization members by search term
 * @param members - Array of organization members
 * @param searchTerm - Search term to filter by
 * @returns Filtered members matching the search term
 */
export const filterMembersBySearch = (members: any[], searchTerm: string): any[] => {
  if (!searchTerm) return members

  const term = searchTerm.toLowerCase()
  return members.filter(member =>
    member.student?.full_name?.toLowerCase().includes(term) ||
    member.student?.email?.toLowerCase().includes(term) ||
    member.student?.student_number?.toLowerCase().includes(term)
  )
}

/**
 * Prepares organization data for card display
 * @param organization - Organization object
 * @returns Formatted organization data for UI display
 */
export const prepareOrganizationCardData = (organization: any) => {
  return {
    id: organization.id,
    title: organization.title || 'Untitled Organization',
    createdAt: organization.created_at,
    formattedCreatedAt: formatDate(organization.created_at),
    isLeader: true, // This would be determined by the calling component
    memberCount: organization.member_count || 0
  }
}

/**
 * Creates member management handlers factory
 * @param config - Configuration object with callbacks and state
 * @returns Object with standardized member management handlers
 */
export const createMemberManagementHandlers = (config: {
  setSelectedOrganization: (org: any) => void
  setMembersDialog: (open: boolean) => void
  fetchOrganizationMembers: (orgId: string) => Promise<any>
  fetchAvailableStudents: (orgId: string) => Promise<any>
  addMemberToOrganization: () => Promise<boolean>
  updateOrganizationMember: (memberId: string, updates: any) => Promise<boolean>
  removeMemberFromOrganization: (memberId: string) => Promise<boolean>
  resetMemberForm: () => void
  clearMembersData: () => void
  getSelectedOrganization: () => any
}) => {

  const handleManageMembers = async (organization: any) => {
    config.setSelectedOrganization(organization)
    config.setMembersDialog(true)

    // Fetch members and available students
    await Promise.all([
      config.fetchOrganizationMembers(organization.id),
      config.fetchAvailableStudents(organization.id)
    ])
  }

  const handleAddMember = async () => {
    const success = await config.addMemberToOrganization()
    if (success) {
      config.resetMemberForm()
      // Refresh members list
      const selectedOrg = config.getSelectedOrganization()
      if (selectedOrg) {
        await Promise.all([
          config.fetchOrganizationMembers(selectedOrg.id),
          config.fetchAvailableStudents(selectedOrg.id)
        ])
      }
    }
  }

  const handleUpdateMember = async (memberId: string, updates: any) => {
    const success = await config.updateOrganizationMember(memberId, updates)
    if (success) {
      const selectedOrg = config.getSelectedOrganization()
      if (selectedOrg) {
        // Refresh members list
        await config.fetchOrganizationMembers(selectedOrg.id)
      }
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    const success = await config.removeMemberFromOrganization(memberId)
    if (success) {
      const selectedOrg = config.getSelectedOrganization()
      if (selectedOrg) {
        // Refresh members list
        await config.fetchOrganizationMembers(selectedOrg.id)
      }
    }
  }

  const handleCloseMembersDialog = () => {
    config.setMembersDialog(false)
    config.setSelectedOrganization(null)
    // Clear members data to prevent showing stale data
    config.clearMembersData()
  }

  return {
    handleManageMembers,
    handleAddMember,
    handleUpdateMember,
    handleRemoveMember,
    handleCloseMembersDialog
  }
}

/**
 * Creates a handler for viewing organization members (admin/read-only mode)
 * @param config - Configuration object with callbacks and state
 * @returns Handler function for viewing members
 */
export const createViewMembersHandler = (config: {
  setSelectedOrganization: (org: any) => void
  setMembersDialog: (open: boolean) => void
  fetchOrganizationMembers: (orgId: string) => Promise<any>
  fetchAvailableStudents?: (orgId: string) => Promise<any> // Optional for view-only mode
  viewOnly?: boolean // If true, won't fetch available students
}) => {

  return async (organization: any) => {
    config.setSelectedOrganization(organization)
    config.setMembersDialog(true)

    // Fetch members, and optionally available students based on mode
    if (config.viewOnly || !config.fetchAvailableStudents) {
      // View-only mode: fetch members only
      await config.fetchOrganizationMembers(organization.id)
    } else {
      // Full management mode: fetch both members and available students
      await Promise.all([
        config.fetchOrganizationMembers(organization.id),
        config.fetchAvailableStudents(organization.id)
      ])
    }
  }
}

// ========================================
// ORGANIZATION CONFIGURATION
// ========================================

/**
 * Table configuration for Organizations data table
 */
export const organizationsTableHeaders = [
  { title: 'Organization Name', key: 'title', sortable: true },
  { title: 'Leader', key: 'leader', sortable: true },
  { title: 'Created Date', key: 'created_at', sortable: true },
  { title: 'Actions', key: 'actions', sortable: false },
]

/**
 * Form validation rules for organizations
 */
export const organizationValidationRules = {
  title: [
    (v: string) => !!v || 'Organization name is required'
  ]
}
