/**
 * Theme Management Composable
 *
 * Handles dynamic theme loading from external-page.json
 * and applies themes to Vuetify instance
 */

import { readonly, ref } from 'vue'
import { vuetify } from '@/plugins/vuetify'
import { createDynamicThemes } from '@/themes'

// Global state for theme loading
const isThemeLoaded = ref(false)
const themeLoadError = ref<string | null>(null)
const isLoadingTheme = ref(false)

export function useTheme () {
  /**
   * Initialize and load dynamic themes from external-page.json
   */
  const initializeTheme = async (): Promise<void> => {
    if (isThemeLoaded.value) {
      return // Already loaded
    }

    try {
      isLoadingTheme.value = true
      themeLoadError.value = null

      // Load dynamic themes from external-page.json
      const themes = await createDynamicThemes()

      // Update Vuetify themes
      if (vuetify.theme && vuetify.theme.themes) {
        vuetify.theme.themes.value.light = themes.light
        vuetify.theme.themes.value.dark = themes.dark
      }

      isThemeLoaded.value = true
      console.log('Dynamic themes loaded successfully')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load theme configuration'
      themeLoadError.value = errorMessage
      console.error('Theme initialization failed:', error)
      throw error
    } finally {
      isLoadingTheme.value = false
    }
  }

  /**
   * Toggle between light and dark themes
   */
  const toggleTheme = (): void => {
    if (vuetify.theme) {
      const currentTheme = vuetify.theme.global.name.value
      vuetify.theme.global.name.value = currentTheme === 'light' ? 'dark' : 'light'
    }
  }

  /**
   * Set specific theme
   */
  const setTheme = (themeName: 'light' | 'dark'): void => {
    if (vuetify.theme) {
      vuetify.theme.global.name.value = themeName
    }
  }

  /**
   * Get current theme name
   */
  const getCurrentTheme = (): string => {
    return vuetify.theme?.global.name.value || 'light'
  }

  return {
    // State
    isThemeLoaded: readonly(isThemeLoaded),
    themeLoadError: readonly(themeLoadError),
    isLoadingTheme: readonly(isLoadingTheme),

    // Actions
    initializeTheme,
    toggleTheme,
    setTheme,
    getCurrentTheme,
  }
}
