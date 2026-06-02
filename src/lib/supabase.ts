//if supabase is applied use here

import { createClient } from '@supabase/supabase-js';
import { useToast } from 'vue-toastification';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Service role client for admin operations
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export async function doLogout() {
    // Confirm logout
    const confirmed = window.confirm("Are you sure you want to logout?");

    // If not confirmed, exit the function early
    if (!confirmed) {
      return;
    }

    const toast = useToast();

    // Use the auth store's signOut method which handles everything properly
    const { useAuthUserStore } = await import('@/stores/authUser');
    const authStore = useAuthUserStore();

    const result = await authStore.signOut();

    if (result.error) {
      toast.error("Error during logout.");
      return;
    }

    toast.success("Logout Successfully!");
}
