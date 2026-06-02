/**
 * Dynamic Theme Configuration
 *
 * This file provides factory functions to create themes dynamically
 * from primary and secondary colors defined in external-page.json.
 * No hardcoded colors - fully dependent on external configuration.
 */

// Get colors from external-page.json - no fallbacks, throws error if unavailable
async function getColorsFromExternal (): Promise<{ primary: string, secondary: string }> {
  try {
    const response = await fetch('/data/external-page.json')
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const data = await response.json()

    if (!data.theme?.primaryColor || !data.theme?.secondaryColor) {
      throw new Error('Theme colors not found in external-page.json')
    }

    return {
      primary: data.theme.primaryColor,
      secondary: data.theme.secondaryColor,
    }
  } catch (error) {
    console.error('Failed to load colors from external-page.json:', error)
    throw new Error(`Theme configuration unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Export function to get colors from external source
export { getColorsFromExternal }

// Helper function to convert hex to RGB
function hexToRgb (hex: string): { r: number, g: number, b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
        r: Number.parseInt(result[1], 16),
        g: Number.parseInt(result[2], 16),
        b: Number.parseInt(result[3], 16),
      }
    : null
}

// Helper function to convert RGB to hex
function rgbToHex (r: number, g: number, b: number): string {
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
}

// Helper function to lighten/darken a color
function adjustColor (hex: string, percent: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) {
    return hex
  }

  const factor = 1 + percent
  const r = Math.min(255, Math.max(0, Math.round(rgb.r * factor)))
  const g = Math.min(255, Math.max(0, Math.round(rgb.g * factor)))
  const b = Math.min(255, Math.max(0, Math.round(rgb.b * factor)))

  return rgbToHex(r, g, b)
}

// Helper function to generate contrasting text color
function getContrastColor (hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) {
    return '#000000'
  }

  // Calculate luminance
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255
  return luminance > 0.5 ? '#000000' : '#FFFFFF'
}

// Factory function to create light theme - requires colors from external config
export function createLightTheme (primaryColor: string, secondaryColor: string) {
  return {
    dark: false,
    colors: {
      // Primary colors
      'primary': primaryColor,
      'primary-darken-1': adjustColor(primaryColor, -0.1),
      'primary-lighten-1': adjustColor(primaryColor, 0.1),
      'primary-lighten-2': adjustColor(primaryColor, 0.2),

      // Secondary colors
      'secondary': secondaryColor,
      'secondary-darken-1': adjustColor(secondaryColor, -0.1),
      'secondary-lighten-1': adjustColor(secondaryColor, 0.1),

      // Accent colors (generated from primary)
      'accent': adjustColor(primaryColor, 0.3),
      'accent-darken-1': adjustColor(primaryColor, 0.2),
      'accent-lighten-1': adjustColor(primaryColor, 0.4),

      // Background and surface colors
      'background': '#FEFFFE',
      'surface': secondaryColor,
      'surface-bright': '#FFFFFF',
      'surface-light': secondaryColor,
      'surface-variant': adjustColor(secondaryColor, -0.05),
      'on-surface-variant': primaryColor,

      // Text colors
      'on-primary': getContrastColor(primaryColor),
      'on-secondary': getContrastColor(secondaryColor),
      'on-background': '#1C1D1A',
      'on-surface': '#1C1D1A',

      // State colors
      'error': '#DC3545',
      'warning': '#FFC107',
      'info': '#17A2B8',
      'success': adjustColor(primaryColor, 0.2),

      'on-error': '#FFFFFF',
      'on-warning': '#000000',
      'on-info': '#FFFFFF',
      'on-success': getContrastColor(adjustColor(primaryColor, 0.2)),
    },
    variables: {
      'border-color': '#000000',
      'border-opacity': 0.12,
      'high-emphasis-opacity': 0.87,
      'medium-emphasis-opacity': 0.6,
      'disabled-opacity': 0.38,
      'idle-opacity': 0.04,
      'hover-opacity': 0.08,
      'focus-opacity': 0.12,
      'selected-opacity': 0.08,
      'activated-opacity': 0.12,
      'pressed-opacity': 0.16,
      'dragged-opacity': 0.08,
    },
  }
}

// Factory function to create dark theme - requires colors from external config
export function createDarkTheme (primaryColor: string, secondaryColor: string) {
  return {
    dark: true,
    colors: {
      // Primary colors (lighter for dark mode)
      'primary': adjustColor(primaryColor, 0.2),
      'primary-darken-1': primaryColor,
      'primary-lighten-1': adjustColor(primaryColor, 0.3),
      'primary-lighten-2': adjustColor(primaryColor, 0.4),

      // Secondary colors adapted for dark mode
      'secondary': adjustColor(primaryColor, -0.2),
      'secondary-darken-1': adjustColor(primaryColor, -0.3),
      'secondary-lighten-1': adjustColor(primaryColor, -0.1),

      // Accent colors for dark mode
      'accent': adjustColor(primaryColor, 0.4),
      'accent-darken-1': adjustColor(primaryColor, 0.3),
      'accent-lighten-1': adjustColor(primaryColor, 0.5),

      // Dark mode backgrounds
      'background': '#121212',
      'surface': '#1E1E1E',
      'surface-bright': '#2D2D2D',
      'surface-light': '#2A2A2A',
      'surface-variant': '#424242',
      'on-surface-variant': adjustColor(primaryColor, 0.4),

      // Dark mode text colors
      'on-primary': getContrastColor(adjustColor(primaryColor, 0.2)),
      'on-secondary': secondaryColor,
      'on-background': '#FFFFFF',
      'on-surface': '#FFFFFF',

      // State colors for dark mode
      'error': '#FF5722',
      'warning': '#FF9800',
      'info': '#2196F3',
      'success': adjustColor(primaryColor, 0.3),

      'on-error': '#FFFFFF',
      'on-warning': '#000000',
      'on-info': '#FFFFFF',
      'on-success': getContrastColor(adjustColor(primaryColor, 0.3)),
    },
    variables: {
      'border-color': '#FFFFFF',
      'border-opacity': 0.12,
      'high-emphasis-opacity': 0.87,
      'medium-emphasis-opacity': 0.6,
      'disabled-opacity': 0.38,
      'idle-opacity': 0.04,
      'hover-opacity': 0.12,
      'focus-opacity': 0.16,
      'selected-opacity': 0.12,
      'activated-opacity': 0.16,
      'pressed-opacity': 0.2,
      'dragged-opacity': 0.12,
    },
  }
}

// Main function to create dynamic themes based on external-page.json
export async function createDynamicThemes () {
  const { primary, secondary } = await getColorsFromExternal()
  return {
    light: createLightTheme(primary, secondary),
    dark: createDarkTheme(primary, secondary),
  }
}
