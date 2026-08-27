// test-utils.js
import { render } from '@testing-library/vue'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createTestingPinia } from '@pinia/testing'

// 1. Create the Vuetify instance
const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'dark',
  },
  // Keep in sync with src/plugins/vuetify.ts: v4's breakpoints are narrower and
  // the app is tuned to the v3 scale.
  display: {
    thresholds: {
      xs: 0,
      sm: 600,
      md: 960,
      lg: 1280,
      xl: 1920,
      xxl: 2560,
    },
  },
  defaults: {
    // Keep in sync with src/plugins/vuetify.ts: stable VNumberInput rounds to
    // integers by default; null restores unrestricted decimals.
    VNumberInput: {
      precision: null,
    },
  },
})

/**
 * Custom render that includes the Vuetify plugin.
 *
 * `pinia` swaps the stubbed store the default testing Pinia installs. Pass a real one
 * (`createTestingPinia({ stubActions: false })`) when the component under test reads something a
 * store computes rather than holds — the game data behind every part name, most of all, which a
 * stubbed action hands back as undefined. Anything else in `global` is merged, plugins included.
 */
export function vuetifyRender (component: any, options: Record<string, any> = {}) {
  const { global: globalOptions = {}, pinia, ...rest } = options

  return render(component, {
    ...rest,
    global: {
      ...globalOptions,
      plugins: [vuetify, pinia ?? createTestingPinia(), ...(globalOptions.plugins ?? [])],
    },
  })
}
