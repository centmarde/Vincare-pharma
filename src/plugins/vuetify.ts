/**
 * plugins/vuetify.ts
 *
 * Framework documentation: https://vuetifyjs.com`
 */

// Composables
import { createVuetify } from 'vuetify'

// Styles
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'

// Create vuetify instance with minimal initial configuration
// Theme will be loaded dynamically from external-page.json
const vuetify = createVuetify({
  theme: {
    defaultTheme: 'dark',
    themes: {
      light: {
        dark: false,
        colors: {
          // Temporary minimal theme - will be replaced by dynamic loading
          primary: '#1976D2',
          secondary: '#424242',
        },
      },
      dark: {
        dark: true,
        colors: {
          // Temporary minimal theme - will be replaced by dynamic loading
          primary: '#2196F3',
          secondary: '#616161',
        },
      },
    },
  },
})

// Export vuetify instance for dynamic theme updates
export { vuetify }

// https://vuetifyjs.com/en/introduction/why-vuetify/#feature-guides
export default vuetify
