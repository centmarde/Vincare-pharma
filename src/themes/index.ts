import type { ThemeConfig } from '@/controller/landingController'
import { createDarkTheme, createDynamicThemes, createLightTheme, getColorsFromExternal } from './base'

// Function to create dynamic theme configuration from external config interface
export function createDynamicThemeConfig (themeConfig: ThemeConfig) {
  const { primaryColor, secondaryColor } = themeConfig

  return {
    defaultTheme: 'light',
    themes: {
      light: createLightTheme(primaryColor, secondaryColor),
      dark: createDarkTheme(primaryColor, secondaryColor),
    },
  }
}

// Function to create dynamic theme configuration from external-page.json
export async function createDynamicThemeConfigFromExternal () {
  const { primary, secondary } = await getColorsFromExternal()

  return {
    defaultTheme: 'light',
    themes: {
      light: createLightTheme(primary, secondary),
      dark: createDarkTheme(primary, secondary),
    },
  }
}

// Main theme configuration - dynamically loads from external-page.json
export async function getThemeConfig () {
  try {
    const themes = await createDynamicThemes()
    return {
      defaultTheme: 'light',
      themes,
    }
  } catch (error) {
    console.error('Failed to load dynamic themes:', error)
    throw error
  }
}

export { createDarkTheme, createDynamicThemes, createLightTheme, getColorsFromExternal } from './base'
