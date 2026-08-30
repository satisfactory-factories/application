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
import { configDefaults, coverageConfigDefaults, defineConfig } from 'vitest/config'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

// e2e/ is Playwright's, and it must stay out of Vitest entirely: its files import
// @playwright/test, which cannot run under jsdom. The *.e2e.ts naming already
// misses Vitest's include, so these two are belt and braces.
const PLAYWRIGHT_FILES = ['e2e/**', 'playwright.config.ts']

// The repo root package.json is the single version for everything here, and it is what the
// backend's client gate compares against. Read at config time so a build can never ship a
// version that disagrees with the release it came from — and so a missing root manifest fails
// the build rather than silently stamping a placeholder.
//
// Handed over as a VITE_ variable rather than a `define`: Vite only applies `define` to the
// client environment, so under Vitest the constant would be undefined and every spec touching
// the config would die on it. import.meta.env works in dev, in the build and in tests, which is
// the same route VITE_ENV already takes.
process.env.VITE_APP_VERSION = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')
).version

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
      // Compiles Vuetify's Sass so the breakpoint overrides in the settings file
      // reach the generated media queries. See that file for why.
      //
      // Not under Vitest: compiling from source costs ~5x the transform time
      // (8.6s → 69s across the suite in CI, enough to time out a 5s test), and
      // it buys nothing there — jsdom does no layout, so no test can observe a
      // media query. The app's own styles load either way.
      ...(process.env.VITEST
        ? {}
        : { styles: { configFile: 'src/assets/styles/vuetify-settings.scss' } }),
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
      // Matches the tsconfig path: bundle `common` from source, so a web build (and
      // Vercel's) never waits on that package having been compiled first.
      common: fileURLToPath(new URL('../common/src/index.ts', import.meta.url)),
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
    exclude: [...configDefaults.exclude, ...PLAYWRIGHT_FILES],
    coverage: {
      exclude: [...coverageConfigDefaults.exclude, ...PLAYWRIGHT_FILES],
    },
    css: true,
    // The suite waits out roughly 135 seconds of real debounce timers across its component specs,
    // and a jsdom + Vuetify mount on top of that does not fit in Vitest's 5s default once the
    // files are running in parallel. Tests were failing on the timeout rather than on an
    // assertion, on a different handful each run — worst seen was a 384ms test taking 15.6s.
    // CI runs on 4 vCPUs, so it is permanently in the contended state this only reaches under load.
    testTimeout: 20000,
    hookTimeout: 30000,
    server: {
      deps: {
        inline: ['vuetify'],
      },
    },
  },
}))
