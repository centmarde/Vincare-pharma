import { useToast } from 'vue-toastification';
import { useAuthUserStore } from '@/stores/authUser';
import { useUserPagesStore } from '@/stores/pages';
import type { RouteLocationNormalized, NavigationGuardNext, Router } from 'vue-router';

/**
 * Authentication and role-based page access guard
 */
export const authGuard = async (to: RouteLocationNormalized, from: RouteLocationNormalized, next: NavigationGuardNext) => {
  const isLoggedIn = localStorage.getItem("access_token") !== null;
  const publicPages = ["/", "/auth"];
  const toast = useToast();

  // If user is not authenticated and trying to access protected page
  if (to.meta.requiresAuth && !isLoggedIn) {
    /* toast.error("Authentication is required to access this page."); */
    return next("/auth");
  }

  // If user is authenticated and trying to access public/auth pages, redirect to dashboard
  if (isLoggedIn && publicPages.includes(to.path)) {
    /*  toast.info("You are already logged in. Redirecting to home."); */
    return next("/account/home");
  }

  // Check role-based page access for authenticated users on protected routes
  if (isLoggedIn && to.meta.requiresAuth && !to.path.startsWith("/account/")) {
    try {
      const authStore = useAuthUserStore();
      const pagesStore = useUserPagesStore();

      // Get current user data to access role ID from metadata
      const currentUserResult = await authStore.getCurrentUser();

      if (currentUserResult.user) {
        const userRoleId = currentUserResult.user.user_metadata?.role;

        if (userRoleId) {
          console.log('Checking page access for role ID:', userRoleId);
          console.log('Requested path:', to.path);

          // Fetch pages accessible by this role
          const rolePages = await pagesStore.fetchRolePagesByRoleId(userRoleId);

          if (rolePages && rolePages.length > 0) {
            // Check if the current path is in the allowed pages
            const allowedPages = rolePages.map(rolePage => rolePage.pages).filter(Boolean);
            const isPageAllowed = allowedPages.includes(to.path);

            console.log('Allowed pages for role:', allowedPages);
            console.log('Is page allowed:', isPageAllowed);

            if (!isPageAllowed) {
              console.log('Access denied for path:', to.path, 'Role ID:', userRoleId);
              return next("/forbidden"); // Redirect to forbidden page if access denied
            }
          } else {
            // No pages defined for this role - redirect to forbidden page
            console.log('No pages configured for role ID:', userRoleId);
            return next("/forbidden");
          }
        } else {
          console.log('No role ID found in user metadata');
          // If no role ID, allow access but log the issue
        }
      }
    } catch (error) {
      console.error('Error checking role-based page access:', error);
      // Continue with navigation if there's an error to avoid blocking the user
    }
  }

  next();
};

/**
 * Error handler for router errors, particularly dynamic import failures
 */
export const errorHandler = (err: any, to: RouteLocationNormalized) => {
  if (err?.message?.includes?.("Failed to fetch dynamically imported module")) {
    if (!localStorage.getItem("vuetify:dynamic-reload")) {
      console.log("Reloading page to fix dynamic import error");
      localStorage.setItem("vuetify:dynamic-reload", "true");
      location.assign(to.fullPath);
    } else {
      console.error("Dynamic import error, reloading page did not fix it", err);
    }
  } else {
    console.error(err);
  }
};

/**
 * Setup guards for the router instance
 */
export const setupGuards = (router: Router) => {
  // Setup navigation guard
  router.beforeEach(authGuard);

  // Setup error handler
  router.onError(errorHandler);

  // Setup ready handler to clean up dynamic reload flag
  router.isReady().then(() => {
    localStorage.removeItem("vuetify:dynamic-reload");
  });
};
