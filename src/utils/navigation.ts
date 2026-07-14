export interface NavigationItem {
  title: string
  icon: string
  route: string
  selected?: boolean
  permission?: string // Optional permission key for role-based access
  keywords?: string // Comma-separated search terms for easier discovery
  // Extra routes that should still count as "this item is active" for
  // sidebar highlight/expand. Set when a tabbed sub-group is collapsed into a
  // single link (its tab sub-pages), so the section stays lit while you're on
  // a tab. See useUserPermissions.getFilteredNavigationItems.
  activeRoutes?: string[]
}

// An optional third level: a group's children can include a labeled
// sub-section instead of only flat leaf items — e.g. "Finance Controls"
// containing "Income Statement" and "Balance Sheet" as sub-groups whose own
// children are surfaced as v-tabs inside a single view rather than as separate
// sidebar entries. A sub-group with a `route` renders in the sidebar/navbars as
// ONE link to that route (its children become tabs, see FinanceSectionTabs);
// the Admin role editor still bundles its children into a single grantable
// checkbox. Existing flat groups elsewhere are unaffected.
export interface NavigationSubGroup {
  title: string
  icon: string
  permission?: string
  route?: string // if set, sidebar/navbars collapse this sub-group to one link
  children: NavigationItem[]
}

export type NavigationChild = NavigationItem | NavigationSubGroup

// A sub-group is the only child shape with a `children` array; a leaf item never
// has one. Discriminate on that (NOT on `route`, which a sub-group may now also
// carry for its collapsed-link target).
export function isNavigationItem(child: NavigationChild): child is NavigationItem {
  return !('children' in child)
}

export interface NavigationGroup {
  title: string
  icon: string
  permission?: string // Optional permission key for the entire group
  children: NavigationChild[]
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
      {
        title: 'Procurement Requests',
        icon: 'mdi-bell-alert-outline',
        route: '/purchasing/procurement-requests',
        permission: 'purchasing.procurement.view',
        keywords: 'canvass, supplier, shortfall, in-house, ethical, request',
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
        keywords: 'revenue, orders, customers, selling',
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
      {
        title: 'Branches',
        icon: 'mdi-store-marker',
        route: '/sales/outlets',
        permission: 'sales.outlets.manage',
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
        title: 'Delivery Receipts',
        icon: 'mdi-truck-check',
        route: '/inhouse/delivery-receipts',
        permission: 'inhouse.deliveryReceipts.view',
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
    title: 'Ethical Controls',
    icon: 'mdi-hospital-box',
    permission: 'ethical.access',
    children: [
      {
        title: 'Ethical Orders',
        icon: 'mdi-file-document',
        route: '/ethical/orders',
        permission: 'ethical.orders.view',
      },
      {
        title: 'Customers',
        icon: 'mdi-account-multiple',
        route: '/ethical/customers',
        permission: 'ethical.customers.manage',
      },
      {
        title: 'Sales Agents',
        icon: 'mdi-account-tie',
        route: '/ethical/agents',
        permission: 'ethical.agents.manage',
      },
      {
        title: 'Commission Tracking',
        icon: 'mdi-percent',
        route: '/ethical/commissions',
        permission: 'ethical.commissions.view',
      },
      {
        title: 'Delivery Receipts',
        icon: 'mdi-truck-check',
        route: '/ethical/delivery-receipts',
        permission: 'ethical.deliveryReceipts.view',
      },
    ],
  },
  {
    // Single umbrella group. Income Statement and Balance Sheet are sub-groups
    // (CLAUDE.md SECTION 1 / SECTION 2 account taxonomy) that each carry a
    // `route`: the sidebar/navbars collapse them to ONE link, and their children
    // are surfaced as v-tabs inside that view (see FinanceSectionTabs), not as
    // separate sidebar entries. The Admin role editor still bundles each
    // sub-group's children into one grantable checkbox. Trial Balance and
    // General Journal are cross-cutting (every account, not just one section's)
    // so they stay as flat leaf items directly under Finance Controls.
    title: 'Finance Controls',
    icon: 'mdi-currency-usd',
    permission: 'finance.access',
    children: [
      {
        title: 'Income Statement',
        icon: 'mdi-finance',
        permission: 'finance.incomeStatement.access',
        route: '/finance/income-statement',
        children: [
          {
            title: 'Income Statement',
            icon: 'mdi-finance',
            route: '/finance/income-statement',
            permission: 'finance.incomeStatement.view',
          },
          {
            title: 'Cash Flow Dashboard',
            icon: 'mdi-view-dashboard',
            route: '/finance/dashboard',
            permission: 'finance.dashboard.view',
          },
          {
            title: 'Expenses',
            icon: 'mdi-cash-minus',
            route: '/finance/expenses',
            permission: 'finance.expenses.manage',
          },
          {
            title: 'Expense Report',
            icon: 'mdi-file-chart',
            route: '/finance/expense-report',
            permission: 'finance.expenseReport.view',
          },
        ],
      },
      {
        title: 'Balance Sheet',
        icon: 'mdi-scale-balance',
        permission: 'finance.balanceSheet.access',
        route: '/finance/balance-sheet',
        children: [
          {
            title: 'Balance Sheet',
            icon: 'mdi-scale-balance',
            route: '/finance/balance-sheet',
            permission: 'finance.balanceSheet.view',
          },
          {
            title: 'Accounts Receivable',
            icon: 'mdi-cash-clock',
            route: '/finance/accounts-receivable',
            permission: 'finance.ar.view',
          },
          {
            title: 'Supplier Payments',
            icon: 'mdi-bank-transfer-out',
            route: '/finance/supplier-payments',
            permission: 'finance.payments.manage',
          },
          {
            title: 'Cash Accounts',
            icon: 'mdi-bank',
            route: '/finance/cash-accounts',
            permission: 'finance.cashAccounts.manage',
          },
          {
            title: 'Discrepancies',
            icon: 'mdi-alert-decagram',
            route: '/finance/discrepancies',
            permission: 'finance.discrepancies.view',
          },
        ],
      },
      {
        title: 'Trial Balance',
        icon: 'mdi-table-check',
        route: '/finance/trial-balance',
        permission: 'finance.trialBalance.view',
      },
      {
        title: 'General Journal',
        icon: 'mdi-book-open-variant',
        route: '/finance/general-journal',
        permission: 'finance.generalJournal.manage',
      },
      {
        title: 'Chart of Accounts',
        icon: 'mdi-format-list-bulleted',
        route: '/finance/chart-of-accounts',
        permission: 'finance.chartOfAccounts.manage',
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

// Recursively collect every leaf NavigationItem out of a children array,
// descending into sub-groups (e.g. Finance Controls -> Income Statement
// Controls -> Income Statement). Used wherever code only cares about the
// flat set of routes/permissions, not the visual nesting.
export function flattenNavigationItems(children: NavigationChild[]): NavigationItem[] {
  return children.flatMap((child) =>
    isNavigationItem(child) ? [child] : flattenNavigationItems(child.children),
  )
}

// Helper function to get all permissions from navigation config.
// Walks every level of the tree (groups → sub-groups → leaf items) so that
// sub-group bundle permissions (e.g. 'finance.incomeStatement.access') are
// included alongside individual leaf permissions.
export const getAllPermissions = (): string[] => {
  const permissions: string[] = []

  function collect(children: NavigationChild[]) {
    for (const child of children) {
      if (isNavigationItem(child)) {
        if (child.permission) permissions.push(child.permission)
      } else {
        if (child.permission) permissions.push(child.permission)
        collect(child.children)
      }
    }
  }

  navigationConfig.forEach((group) => {
    if (group.permission) permissions.push(group.permission)
    collect(group.children)
  })

  return [...new Set(permissions)]
}

// A child annotated with selection state for the role-permission editor UI.
// Leaf items get `selected`; sub-groups keep their nested children annotated
// recursively so the editor can render the same group/sub-group tree shape.
export type SelectableNavigationChild =
  | (NavigationItem & { selected: boolean })
  | (Omit<NavigationSubGroup, 'children'> & { children: SelectableNavigationChild[] })

export type SelectableNavigationGroup = Omit<NavigationGroup, 'children'> & {
  children: SelectableNavigationChild[]
}

export function isSelectableNavigationItem(
  child: SelectableNavigationChild,
): child is NavigationItem & { selected: boolean } {
  // Discriminate on `children` (only sub-groups have it), NOT `route` — a routed
  // sub-group now carries a `route` too but must still render as a bundle.
  return !('children' in child)
}

function withSelection(
  children: NavigationChild[],
  selectedPermissions: string[],
): SelectableNavigationChild[] {
  return children.map((child) => {
    if (isNavigationItem(child)) {
      return { ...child, selected: selectedPermissions.includes(child.permission || child.route) }
    }
    return { ...child, children: withSelection(child.children, selectedPermissions) }
  })
}

// Helper function to get navigation items with selected state
export const getNavigationWithSelection = (
  selectedPermissions: string[] = [],
): SelectableNavigationGroup[] => {
  return navigationConfig.map((group) => ({
    ...group,
    children: withSelection(group.children, selectedPermissions),
  }))
}
