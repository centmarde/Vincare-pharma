/**
 * main.ts
 *
 * Bootstraps Vuetify and other plugins then mounts the App`
 */

// Plugins
import { registerPlugins } from '@/plugins'
import 'vue-toastification/dist/index.css'
// Components
import App from './App.vue'

// Composables
import { createApp } from 'vue'
// Styles
import 'unfonts.css'

const app = createApp(App)

registerPlugins(app)

app.mount('#app')

// Initialize theme after app is mounted (Pinia and Vuetify are ready)
// This loads the saved theme preference from localStorage
import { useTheme } from '@/stores/useTheme'
const themeStore = useTheme()
themeStore.initializeTheme()
