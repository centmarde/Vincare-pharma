/**
 * Theme Store
 *
 * Centralized theme management with:
 * - Pinia store for state management
 * - localStorage persistence
 * - Dynamic theme loading from external-page.json
 * - Light/Dark theme switching
 */

import { ref, computed, readonly } from 'vue'
import { defineStore } from 'pinia'
import { vuetify } from '@/plugins/vuetify'
import { createDynamicThemes } from '@/themes'

const STORAGE_KEY = 'theme-preference'

export const useTheme = defineStore('theme', () => {
  // State
  const isInitialized = ref(false)
  const themeLoadError = ref<string | null>(null)
  const isLoadingTheme = ref(false)

  // Computed: Get current theme from Vuetify
  const currentTheme = computed<'light' | 'dark'>(() => {
    return (vuetify.theme?.global.name.value as 'light' | 'dark') || 'dark'
  })

  /**
   * Initialize theme from localStorage and load dynamic themes
   * Should be called after Vuetify and Pinia are set up
   */
  const initializeTheme = async () => {
    if (isInitialized.value) {
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

      // Apply saved theme preference from localStorage
      const savedTheme = localStorage.getItem(STORAGE_KEY) as 'light' | 'dark' | null
      if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
        if (vuetify.theme) {
          vuetify.theme.global.name.value = savedTheme
        }
      }
      // If no saved theme, keep the default (dark) from vuetify.ts

      isInitialized.value = true
      console.log('Theme initialized successfully')
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to load theme configuration'
      themeLoadError.value = errorMessage
      console.error('Theme initialization failed:', error)
    } finally {
      isLoadingTheme.value = false
    }
  }

  /**
   * Set theme and persist to localStorage
   */
  const setTheme = (theme: 'light' | 'dark') => {
    localStorage.setItem(STORAGE_KEY, theme)
    if (vuetify.theme) {
      vuetify.theme.global.name.value = theme
    }
  }

  /**
   * Toggle between light and dark themes
   */
  const toggleTheme = () => {
    const current = vuetify.theme?.global.name.value || 'dark'
    const newTheme = current === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
  }

  /**
   * Get current theme name
   */
  const getCurrentTheme = (): 'light' | 'dark' => {
    return currentTheme.value
  }

  return {
    // State
    isThemeLoaded: isInitialized,
    currentTheme,
    isInitialized,
    themeLoadError: readonly(themeLoadError),
    isLoadingTheme: readonly(isLoadingTheme),

    // Actions
    initializeTheme,
    setTheme,
    toggleTheme,
    getCurrentTheme,
  }
})
