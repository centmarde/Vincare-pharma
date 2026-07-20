import { setupLayouts } from 'virtual:generated-layouts'
import { createRouter, createWebHistory } from 'vue-router'

import Hero from '@/pages/index.vue'
import Auth from '@/pages/Auth.vue'
import Dashboard from '@/pages/HomeView.vue'
import NotFound from '@/pages/NotFound.vue'
import ForbiddenView from '@/pages/ForbiddenView.vue'
import AdminUserRolesView from '@/pages/admin/AdminUserRolesView.vue'
import UserManagementView from '@/pages/admin/UserManagementView.vue'
import AnnouncementsView from '@/pages/admin/AnnouncementsView.vue'
import SettingsView from '@/pages/account/SettingsView.vue'
import ExecutiveView from '@/pages/executive/ExecutiveView.vue'
import ExecutivePurchaseRequisitionDashboardView from '@/pages/executive/ExecutivePRView.vue'
import PurchasingListView from '@/pages/purchasing/PurchasingListView.vue'
import PurchaseOrdersView from '@/pages/purchasing/PurchaseOrdersView.vue'
import ProcurementRequestsView from '@/pages/purchasing/ProcurementRequestsView.vue'
import WareHouseView from '@/pages/warehouse/WareHouseView.vue'
import StockTransfersReviewView from '@/pages/warehouse/StockTransfersReviewView.vue'
import SalesView from '@/pages/sales/SalesView.vue'
import StockTransfersView from '@/pages/sales/StockTransfersView.vue'
import PosView from '@/pages/sales/PosView.vue'
import RemittanceView from '@/pages/sales/RemittanceView.vue'
import InventoryView from '@/pages/sales/InventoryView.vue'
import SalesHistoryView from '@/pages/sales/SalesHistoryView.vue'
import OutletsView from '@/pages/sales/OutletsView.vue'
import InhouseOrdersView from '@/pages/inhouse/InhouseOrdersView.vue'
import CustomersView from '@/pages/inhouse/CustomersView.vue'
import DeliveryReceiptsView from '@/pages/inhouse/DeliveryReceiptsView.vue'
import EthicalOrdersView from '@/pages/ethical/EthicalOrdersView.vue'
import EthicalCustomersView from '@/pages/ethical/CustomersView.vue'
import EthicalAgentsView from '@/pages/ethical/AgentsView.vue'
import EthicalCommissionsView from '@/pages/ethical/CommissionsView.vue'
import FinanceView from '@/pages/finance/FinanceView.vue'
import ExpensesView from '@/pages/finance/ExpensesView.vue'
import SupplierPaymentsView from '@/pages/finance/SupplierPaymentsView.vue'
import DiscrepanciesView from '@/pages/finance/DiscrepanciesView.vue'
import AccountsReceivableView from '@/pages/finance/AccountsReceivableView.vue'
import CashAccountsView from '@/pages/finance/CashAccountsView.vue'
import ExpenseReportView from '@/pages/finance/ExpenseReportView.vue'
import IncomeStatementView from '@/pages/finance/IncomeStatementView.vue'
import BalanceSheetView from '@/pages/finance/BalanceSheetView.vue'
import TrialBalanceView from '@/pages/finance/TrialBalanceView.vue'
import GeneralJournalView from '@/pages/finance/GeneralJournalView.vue'
import ChartOfAccountsView from '@/pages/finance/ChartOfAccountsView.vue'
import SuppliersView from '@/pages/suppliers/SuppliersView.vue'
import LogsView from '@/pages/logs/LogsView.vue'
import WarehouseProductsListView from '@/pages/warehouse/ProductsListView.vue'

/**
 * Route definitions for the application
 */
const routes = setupLayouts([
  {
    path: '/',
    component: Hero,
  },
  {
    path: '/auth',
    component: Auth,
  },

  {
    path: '/account/home',
    component: Dashboard,
    meta: { requiresAuth: true },
  },
  {
    path: '/account/settings',
    component: SettingsView,
    meta: { requiresAuth: true },
  },
  {
    path: '/admin/user-roles',
    component: AdminUserRolesView,
    meta: { requiresAuth: true },
  },
  {
    path: '/admin/user-management',
    component: UserManagementView,
    meta: { requiresAuth: true },
  },
  {
    path: '/admin/announcements',
    component: AnnouncementsView,
    meta: { requiresAuth: true },
  },
  {
    path: '/executive/dashboard',
    component: ExecutiveView,
    meta: { requiresAuth: true },
  },
    {
    path: '/executive/purchase-requisition-dashboard',
    component: ExecutivePurchaseRequisitionDashboardView,
    meta: { requiresAuth: true },
  },
  {
    path: '/purchasing/purchase-requisitions',
    component: PurchasingListView,
    meta: { requiresAuth: true },
  },
  {
    path: '/purchasing/purchase-orders',
    component: PurchaseOrdersView,
    meta: { requiresAuth: true },
  },
  {
    path: '/purchasing/procurement-requests',
    component: ProcurementRequestsView,
    meta: { requiresAuth: true },
  },
  {
    path: '/warehouse/dashboard',
    component: WareHouseView,
    meta: { requiresAuth: true },
  },
  {
    path: '/warehouse/products',
    component: WarehouseProductsListView,
    meta: { requiresAuth: true },
  },
  {
    path: '/warehouse/stock-transfers',
    component: StockTransfersReviewView,
    meta: { requiresAuth: true },
  },
  {
    path: '/sales/dashboard',
    component: SalesView,
    meta: { requiresAuth: true },
  },
  {
    path: '/sales/stock-transfers',
    component: StockTransfersView,
    meta: { requiresAuth: true },
  },
  {
    path: '/sales/pos',
    component: PosView,
    meta: { requiresAuth: true },
  },
  {
    path: '/sales/remittance',
    component: RemittanceView,
    meta: { requiresAuth: true },
  },
  {
    path: '/sales/inventory',
    component: InventoryView,
    meta: { requiresAuth: true },
  },
  {
    path: '/sales/history',
    component: SalesHistoryView,
    meta: { requiresAuth: true },
  },
  {
    path: '/sales/outlets',
    component: OutletsView,
    meta: { requiresAuth: true },
  },
  {
    path: '/inhouse/orders',
    component: InhouseOrdersView,
    meta: { requiresAuth: true },
  },
  {
    path: '/inhouse/customers',
    component: CustomersView,
    meta: { requiresAuth: true },
  },
  {
    path: '/inhouse/delivery-receipts',
    component: DeliveryReceiptsView,
    meta: { requiresAuth: true },
  },
  {
    // Same unified registry (shows both sources); a separate route so Ethical
    // access can be granted independently of In-House.
    path: '/ethical/delivery-receipts',
    component: DeliveryReceiptsView,
    meta: { requiresAuth: true },
  },
  {
    path: '/ethical/orders',
    component: EthicalOrdersView,
    meta: { requiresAuth: true },
  },
  {
    path: '/ethical/customers',
    component: EthicalCustomersView,
    meta: { requiresAuth: true },
  },
  {
    path: '/ethical/agents',
    component: EthicalAgentsView,
    meta: { requiresAuth: true },
  },
  {
    path: '/ethical/commissions',
    component: EthicalCommissionsView,
    meta: { requiresAuth: true },
  },
  {
    path: '/finance/dashboard',
    component: FinanceView,
    meta: { requiresAuth: true },
  },
  {
    path: '/finance/expenses',
    component: ExpensesView,
    meta: { requiresAuth: true },
  },
  {
    path: '/finance/supplier-payments',
    component: SupplierPaymentsView,
    meta: { requiresAuth: true },
  },
  {
    path: '/finance/accounts-receivable',
    component: AccountsReceivableView,
    meta: { requiresAuth: true },
  },
  {
    path: '/finance/cash-accounts',
    component: CashAccountsView,
    meta: { requiresAuth: true },
  },
  {
    path: '/finance/expense-report',
    component: ExpenseReportView,
    meta: { requiresAuth: true },
  },
  {
    path: '/finance/discrepancies',
    component: DiscrepanciesView,
    meta: { requiresAuth: true },
  },
  {
    path: '/finance/income-statement',
    component: IncomeStatementView,
    meta: { requiresAuth: true },
  },
  {
    path: '/finance/balance-sheet',
    component: BalanceSheetView,
    meta: { requiresAuth: true },
  },
  {
    path: '/finance/trial-balance',
    component: TrialBalanceView,
    meta: { requiresAuth: true },
  },
  {
    path: '/finance/general-journal',
    component: GeneralJournalView,
    meta: { requiresAuth: true },
  },
  {
    path: '/finance/chart-of-accounts',
    component: ChartOfAccountsView,
    meta: { requiresAuth: true },
  },
  {
    path: '/suppliers/dashboard',
    component: SuppliersView,
    meta: { requiresAuth: true },
  },
  {
    path: '/logs',
    component: LogsView,
    meta: { requiresAuth: true },
  },
  {
    path: '/forbidden',
    component: ForbiddenView,
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: NotFound,
  },
])

/**
 * Create and configure the router instance
 */
export const createAppRouter = () => {
  return createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes,
  })
}
