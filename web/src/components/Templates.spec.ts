import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import Templates from './Templates.vue'
import vuetify from '@/plugins/vuetify'
import { DEV_TOOLS_KEY } from '@/sync/offline-conflict-demo'
import { useAppStore } from '@/stores/app-store'

const runDemo = vi.hoisted(() => vi.fn(async () => ({ ok: true as const, tabId: 'demo-tab' })))

vi.mock('@/sync/offline-conflict-demo', async importOriginal => ({
  ...await importOriginal<typeof import('@/sync/offline-conflict-demo')>(),
  runOfflineConflictDemo: runDemo,
}))

const DEMO_ROW = 'Offline conflict demo'

// The shared dialog shell teleports its content to the body, so the rows are read there.
const rowFor = (name: string) => document.body.querySelector<HTMLElement>(`[data-template="${name}"]`)

describe('Templates', () => {
  let pinia: ReturnType<typeof createPinia>

  const openDialog = async () => {
    const wrapper = mount(Templates, {
      global: { plugins: [vuetify, pinia] },
      attachTo: document.body,
    })
    await wrapper.find('button').trigger('click')
    await flushPromises()
    return wrapper
  }

  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    vi.clearAllMocks()
    pinia = createPinia()
    setActivePinia(pinia)
    // Vitest runs as a dev build, which is one of the two things that shows the row. The
    // specs below choose which of the two is being tested.
    vi.stubEnv('DEV', false)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    document.body.innerHTML = ''
  })

  describe('the offline conflict demo row', () => {
    // The negative control: a production build with nobody having asked for dev tools.
    it('is not offered on a normal build', async () => {
      await openDialog()

      expect(rowFor(DEMO_ROW)).toBeNull()
      // The real templates are still there, so this is the row missing rather than the table.
      expect(rowFor('Demo')).not.toBeNull()
    })

    it('is offered on a dev build', async () => {
      vi.stubEnv('DEV', true)

      await openDialog()

      expect(rowFor(DEMO_ROW)).not.toBeNull()
    })

    it('is offered anywhere the dev tools flag is set by hand', async () => {
      localStorage.setItem(DEV_TOOLS_KEY, 'true')

      await openDialog()

      expect(rowFor(DEMO_ROW)).not.toBeNull()
    })

    it('stays hidden for any other value of the flag', async () => {
      localStorage.setItem(DEV_TOOLS_KEY, 'yes')

      await openDialog()

      expect(rowFor(DEMO_ROW)).toBeNull()
    })

    /** It makes its own tab, so it must never reach the loader that overwrites this one. */
    it('runs the demo instead of loading a plan over the current one', async () => {
      localStorage.setItem(DEV_TOOLS_KEY, 'true')
      const prepareLoader = vi.spyOn(useAppStore(), 'prepareLoader').mockResolvedValue()
      await openDialog()

      rowFor(DEMO_ROW)?.querySelector('button')?.click()
      await flushPromises()

      expect(runDemo).toHaveBeenCalledTimes(1)
      expect(prepareLoader).not.toHaveBeenCalled()
    })

    // The control for the assertion above: an ordinary template does reach the loader.
    it('leaves the ordinary templates loading a plan as they always have', async () => {
      const prepareLoader = vi.spyOn(useAppStore(), 'prepareLoader').mockResolvedValue()
      await openDialog()

      rowFor('Simple')?.querySelector('button')?.click()
      await flushPromises()

      expect(prepareLoader).toHaveBeenCalledTimes(1)
      expect(runDemo).not.toHaveBeenCalled()
    })
  })
})
