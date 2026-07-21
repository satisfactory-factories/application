// Plugins
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import Fonts from 'unplugin-fonts/vite'
import Layouts from 'vite-plugin-vue-layouts-next'
import Vue from '@vitejs/plugin-vue'
import VueRouter from 'vue-router/vite'
import Vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'
import vueDevTools from 'vite-plugin-vue-devtools'

// Utilities
import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig(() => ({
  build: {
    target: 'esnext', // Adds support for top level awaits
    minify: false,
    terserOptions: {
      compress: false,
      mangle: false,
    },
  },
  plugins: [
    VueRouter({
      dts: 'src/typed-router.d.ts',
    }),
    Layouts(),
    AutoImport({
      imports: [
        'vue',
        {
          'vue-router': ['useRoute', 'useRouter'],
        },
      ],
      dts: 'src/auto-imports.d.ts',
      eslintrc: {
        enabled: true,
      },
      vueTemplate: true,
    }),
    Components({
      dts: 'src/components.d.ts',
    }),
    Vue({
      template: { transformAssetUrls },
    }),
    // The devtools overlay embeds the full devtools backend (@vue/devtools-kit) into
    // every dev page — including pinia's deep + sync store subscription, which
    // re-traverses the entire plan on every reactive write. On large plans that alone
    // makes edits multi-second in dev, browser extension or not. Opt in when needed:
    //   VITE_DEVTOOLS=true pnpm dev:web
    ...(process.env.VITE_DEVTOOLS === 'true' ? [vueDevTools()] : []),
    Vuetify({
      autoImport: true,
    }),
    Fonts({
      google: {
        families: [{
          name: 'Roboto',
          styles: 'wght@100;300;400;500;700;900',
        }],
      },
    }),
  ],
  define: { 'process.env': {} },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
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
    port: 3000,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    pool: 'forks',
    setupFiles: ['src/setup-vitest.ts'],
    globalSetup: './testing/global-setup.ts',
    globalTeardown: './testing/global-teardown.ts',
    css: true,
    server: {
      deps: {
        inline: ['vuetify'],
      },
    },
  },
}))
