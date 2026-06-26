export interface NavigationItem {
  title: string
  icon: string
  route: string
  selected?: boolean
  permission?: string // Optional permission key for role-based access
  keywords?: string // Comma-separated search terms for easier discovery
}

export interface NavigationGroup {
  title: string
  icon: string
  permission?: string // Optional permission key for the entire group
  children: NavigationItem[]
}

export const navigationConfig: NavigationGroup[] = [
  {
    title: 'My Account',
    icon: 'mdi-account',
    children: [
      {
        title: 'Home',
        icon: 'mdi-home',
        route: '/account/home',
        permission: 'admin.dashboard.view',
        keywords: 'dashboard, overview, main',
      },
      {
        title: 'Settings',
        icon: 'mdi-cog-outline',
        route: '/account/settings',
        keywords: 'preferences, profile, configuration, options',
      },
    ],
  },
  {
    title: 'Admin Controls',
    icon: 'mdi-cog',
    permission: 'admin.access',
    children: [
      {
        title: 'User Management',
        icon: 'mdi-account-multiple',
        route: '/admin/user-management',
        permission: 'admin.users.manage',
        keywords: 'employees, staff, accounts, people, team',
      },
      {
        title: 'User Roles',
        icon: 'mdi-account-key',
        route: '/admin/user-roles',
        permission: 'admin.roles.manage',
        keywords: 'permissions, access, levels, authorization',
      },
      {
        title: 'Announcements',
        icon: 'mdi-bullhorn',
        route: '/admin/announcements',
        permission: 'admin.announcements.manage',
        keywords: 'news, updates, notices, broadcast',
      },
    ],
  },
  {
    title: 'Executive Controls',
    icon: 'mdi-briefcase',
    permission: 'executive.access',
    children: [
      {
        title: 'Executive Dashboard',
        icon: 'mdi-view-dashboard',
        route: '/executive/dashboard',
        permission: 'executive.dashboard.view',
        keywords: 'exec, overview, kpi, metrics, reports',
      },
    ],
  },
  {
    title: 'Purchasing Controls',
    icon: 'mdi-cart',
    permission: 'purchasing.access',
    children: [
      {
        title: 'List of Purchases',
        icon: 'mdi-download-outline',
        route: '/purchasing/list-of-purchases',
        permission: 'purchasing.dashboard.view',
        keywords: 'buy, procurement, orders list, transactions',
      },
      {
        title: 'Purchase Requisitions',
        icon: 'mdi-file-document-edit-outline',
        route: '/purchasing/purchase-requisitions',
        permission: 'purchasing.requisitions.view',
        keywords: 'PR, request, approval, request form',
      },
      {
        title: 'Purchase Orders',
        icon: 'mdi-file-document-outline',
        route: '/purchasing/purchase-orders',
        permission: 'purchasing.orders.view',
        keywords: 'PO, order, supplier order, release',
      },
    ],
  },
  {
    title: 'Warehouse Controls',
    icon: 'mdi-warehouse',
    permission: 'warehouse.access',
    children: [
      {
        title: 'Warehouse Dashboard',
        icon: 'mdi-view-dashboard',
        route: '/warehouse/dashboard',
        permission: 'warehouse.dashboard.view',
        keywords: 'inventory, stock, storage, receiving',
      },
      {
        title: 'Products',
        icon: 'mdi-box',
        route: '/warehouse/products',
        permission: 'warehouse.products.view',
        keywords: 'items, goods, merchandise, inventory list',
      },
    ],
  },
  {
    title: 'Sales Controls',
    icon: 'mdi-cart',
    permission: 'sales.access',
    children: [
      {
        title: 'Sales Dashboard',
        icon: 'mdi-view-dashboard',
        route: '/sales/dashboard',
        permission: 'sales.dashboard.view',
        keywords: 'revenue, orders, customers, selling',
      },
    ],
  },
  {
    title: 'Finance Controls',
    icon: 'mdi-currency-usd',
    permission: 'finance.access',
    children: [
      {
        title: 'Finance Dashboard',
        icon: 'mdi-view-dashboard',
        route: '/finance/dashboard',
        permission: 'finance.dashboard.view',
        keywords: 'accounting, budget, payments, expenses',
      },
    ],
  },
  {
    title: 'Suppliers Controls',
    icon: 'mdi-truck-delivery',
    permission: 'suppliers.access',
    children: [
      {
        title: 'Suppliers Dashboard',
        icon: 'mdi-view-dashboard-variant',
        route: '/suppliers/dashboard',
        permission: 'suppliers.dashboard.view',
        keywords: 'vendors, partners, providers, contractors',
      },
    ],
  },
  {
    title: 'Logs History',
    icon: 'mdi-file-document',
    permission: 'logs.access',
    children: [
      {
        title: 'Logs View',
        icon: 'mdi-file-document',
        route: '/logs',
        permission: 'logs.view',
        keywords: 'audit, history, trail, activity, changes',
      },
    ],
  },
]

// Helper function to get all permissions from navigation config
export const getAllPermissions = (): string[] => {
  const permissions: string[] = []

  navigationConfig.forEach((group) => {
    if (group.permission) {
      permissions.push(group.permission)
    }

    group.children.forEach((item) => {
      if (item.permission) {
        permissions.push(item.permission)
      }
    })
  })

  return [...new Set(permissions)] // Remove duplicates
}

// Helper function to get navigation items with selected state
export const getNavigationWithSelection = (
  selectedPermissions: string[] = [],
): NavigationGroup[] => {
  return navigationConfig.map((group) => ({
    ...group,
    children: group.children.map((item) => ({
      ...item,
      selected: selectedPermissions.includes(item.permission || item.route),
    })),
  }))
}
