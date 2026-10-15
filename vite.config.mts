// Utilities
import { fileURLToPath, URL } from 'node:url'
import Vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import Fonts from 'unplugin-fonts/vite'
import { VueRouterAutoImports } from 'unplugin-vue-router'
import VueRouter from 'unplugin-vue-router/vite'
import { defineConfig } from 'vite'
import type { ModuleNode, Plugin } from 'vite'
import vueDevTools from 'vite-plugin-vue-devtools'
import Layouts from 'vite-plugin-vue-layouts-next'
import Vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'

// Dev only. Pinia keeps the store instance it built first, so hot-updating a
// store file (or anything a store imports) leaves the open tab running the OLD
// actions until a manual refresh — an approval guard added to a store does not
// exist in that tab yet. Reload the page instead of hot-patching.
function reloadOnStoreChange(): Plugin {
  const storeFile = /\/stores\//
  function reachesStore(mod: ModuleNode, seen: Set<ModuleNode>): boolean {
    if (seen.has(mod)) return false
    seen.add(mod)
    if (mod.file && storeFile.test(mod.file)) return true
    // A .vue file hot-swaps cleanly; the update stops there.
    if (mod.isSelfAccepting) return false
    return [...mod.importers].some((importer) => reachesStore(importer, seen))
  }
  return {
    name: 'reload-on-store-change',
    apply: 'serve',
    handleHotUpdate({ modules, server }) {
      const seen = new Set<ModuleNode>()
      if (!modules.some((mod) => reachesStore(mod, seen))) return
      server.ws.send({ type: 'full-reload' })
      return []
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    reloadOnStoreChange(),
    VueRouter({
      dts: 'src/typed-router.d.ts',
    }),
    Layouts(),
    vueDevTools(),
    AutoImport({
      imports: [
        'vue',
        VueRouterAutoImports,
        {
          pinia: ['defineStore', 'storeToRefs'],
        },
      ],
      dts: 'src/auto-imports.d.ts',
      vueTemplate: true,
    }),
    Components({
      dts: 'src/components.d.ts',
    }),
    Vue({
      template: { transformAssetUrls },
    }),
    // https://github.com/vuetifyjs/vuetify-loader/tree/master/packages/vite-plugin#readme
    Vuetify({
      autoImport: true,
      styles: {
        configFile: 'src/styles/settings.scss',
      },
    }),
    Fonts({
      fontsource: {
        families: [
          {
            name: 'Roboto',
            weights: [100, 300, 400, 500, 700, 900],
            styles: ['normal', 'italic'],
          },
        ],
      },
    }),
  ],
  optimizeDeps: {
    exclude: [
      'vuetify',
      'vue-router',
      'unplugin-vue-router/runtime',
      'unplugin-vue-router/data-loaders',
      'unplugin-vue-router/data-loaders/basic',
    ],
  },
  define: { 'process.env': {} },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('src', import.meta.url)),
    },
    extensions: [
      '.js',
      '.json',
      '.jsx',
      '.mjs',
      '.ts',
      '.tsx',
      '.vue',
    ],
  },
  server: {
    port: 1212,
  },
  css: {
    preprocessorOptions: {
      sass: {
        api: 'modern-compiler',
      },
      scss: {
        api: 'modern-compiler',
      },
    },
  },
})
