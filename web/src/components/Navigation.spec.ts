import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import { createMemoryHistory, createRouter } from 'vue-router'
import Navigation from './Navigation.vue'
import { config } from '@/config/config'

const router = () => createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:rest(.*)', component: { template: '<div />' } }],
})

/**
 * The badge is desktop chrome: below `md` the toolbar collapses to the burger. The
 * display width is read when the instance is made, so the window is widened first
 * and Vuetify is built here rather than taken from the app's shared plugin.
 */
const desktopVuetify = () => {
  window.innerWidth = 1600
  return createVuetify()
}

describe('Component: Navigation', () => {
  // Typed in, the badge is only ever right until the next release: it sat on
  // "BETA v0.6" for the whole of v0.7.
  it('takes the release badge from the build it was made from', () => {
    const [major, minor] = config.appVersion.split('.')

    const wrapper = mount(Navigation, {
      global: {
        plugins: [desktopVuetify(), router()],
        // The drawer wants a v-layout around it, and the badge is in the toolbar above.
        stubs: { VNavigationDrawer: true },
      },
    })

    expect(wrapper.find('[data-testid="release-badge"]').text()).toContain(`v${major}.${minor}`)
  })
})
