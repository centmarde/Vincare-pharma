export interface NavigationItem {
  title: string
  icon: string
  route: string
  selected?: boolean
  permission?: string // Optional permission key for role-based access
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
      },
      {
        title: 'Settings',
        icon: 'mdi-cog-outline',
        route: '/account/settings',
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
      },
      {
        title: 'User Roles',
        icon: 'mdi-account-key',
        route: '/admin/user-roles',
        permission: 'admin.roles.manage',
      },
      {
        title: 'Announcements',
        icon: 'mdi-bullhorn',
        route: '/admin/announcements',
        permission: 'admin.announcements.manage',
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
      },
      {
        title: 'Purchase Requisitions',
        icon: 'mdi-file-document-edit-outline',
        route: '/purchasing/purchase-requisitions',
        permission: 'purchasing.requisitions.view',
      },
      {
        title: 'Purchase Orders',
        icon: 'mdi-file-document-outline',
        route: '/purchasing/purchase-orders',
        permission: 'purchasing.orders.view',
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
      },
      {
        title: 'Products',
        icon: 'mdi-box',
        route: '/warehouse/products',
        permission: 'warehouse.products.view',
      },
      {
        title: 'Stock Transfers',
        icon: 'mdi-truck-fast',
        route: '/warehouse/stock-transfers',
        permission: 'warehouse.transfers.manage',
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
      },
      {
        title: 'POS',
        icon: 'mdi-cash-register',
        route: '/sales/pos',
        permission: 'sales.pos.use',
      },
      {
        title: 'Inventory',
        icon: 'mdi-clipboard-list',
        route: '/sales/inventory',
        permission: 'sales.inventory.view',
      },
      {
        title: 'Sales History',
        icon: 'mdi-history',
        route: '/sales/history',
        permission: 'sales.history.view',
      },
      {
        title: 'Remittance',
        icon: 'mdi-cash-multiple',
        route: '/sales/remittance',
        permission: 'sales.remittance.manage',
      },
      {
        title: 'Stock Transfers',
        icon: 'mdi-truck-fast',
        route: '/sales/stock-transfers',
        permission: 'sales.transfers.view',
      },
    ],
  },
  {
    title: 'In-House Controls',
    icon: 'mdi-domain',
    permission: 'inhouse.access',
    children: [
      {
        title: 'In-House Orders',
        icon: 'mdi-file-sign',
        route: '/inhouse/orders',
        permission: 'inhouse.orders.view',
      },
      {
        title: 'Customers',
        icon: 'mdi-account-tie',
        route: '/inhouse/customers',
        permission: 'inhouse.customers.manage',
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
