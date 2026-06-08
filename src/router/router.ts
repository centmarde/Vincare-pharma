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
import PurchasingView from '@/pages/purchasing/PurchasingView.vue'
import WareHouseView from '@/pages/warehouse/WareHouseView.vue'
import SalesView from '@/pages/sales/SalesView.vue'
import FinanceView from '@/pages/finance/FinanceView.vue'
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
    path: '/purchasing/list-of-purchases',
    component: PurchasingView,
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
    path: '/sales/dashboard',
    component: SalesView,
    meta: { requiresAuth: true },
  },
  {
    path: '/finance/dashboard',
    component: FinanceView,
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
