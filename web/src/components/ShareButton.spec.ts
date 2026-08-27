import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ShareButton from './ShareButton.vue'
import vuetify from '@/plugins/vuetify'
import { useAppStore } from '@/stores/app-store'
import { newFactory } from '@/utils/factory-management/factory'
import { vuetifyRender } from '@/utils/ui-test-bootstrap'

describe('ShareButton', () => {
  it('should match snapshot', () => {
    const subject = vuetifyRender(ShareButton)
    expect(subject.html()).toMatchSnapshot()
  })

  // #535: the store reassigns currentFactoryTab when the user switches tabs, and this button sits
  // in app chrome that never remounts — so a copy of the tab taken at setup went on sharing
  // whichever plan happened to be open at page load, under that tab's name. Every case here
  // mounts once up front, exactly as the real button is mounted once for the session.
  describe('follows the current tab', () => {
    let appStore: ReturnType<typeof useAppStore>
    let fetchMock: ReturnType<typeof vi.fn>
    let subject: VueWrapper

    const sharedPlan = () => JSON.parse(fetchMock.mock.calls.at(-1)![1].body)

    const clickShare = async () => {
      await subject.find('button').trigger('click')
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    }

    beforeEach(async () => {
      localStorage.clear()
      setActivePinia(createPinia())
      appStore = useAppStore()

      const firstTab = appStore.getCurrentTab()
      firstTab.name = 'First Plan'
      firstTab.factories = [newFactory('First Factory')]

      // addTab selects the tab it adds, so wind back to the first one — this is the button as
      // the user meets it, mounted against the tab the page opened on.
      appStore.addTab({ name: 'Second Plan', factories: [newFactory('Second Factory')] })
      appStore.currentFactoryTabIndex = 0
      await nextTick()

      fetchMock = vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ shareId: 'abc123' }),
      }))
      vi.stubGlobal('fetch', fetchMock)
      vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn() } })

      subject = mount(ShareButton, { global: { plugins: [vuetify] } })
    })

    afterEach(() => {
      subject.unmount()
      vi.unstubAllGlobals()
    })

    it('shares the tab that is open at mount', async () => {
      await clickShare()

      expect(sharedPlan().name).toBe('First Plan')
      expect(sharedPlan().factories[0].name).toBe('First Factory')
    })

    it('shares the newly selected tab after a tab switch', async () => {
      appStore.currentFactoryTabIndex = 1
      await nextTick()

      await clickShare()

      expect(sharedPlan().name).toBe('Second Plan')
      expect(sharedPlan().factories[0].name).toBe('Second Factory')
    })
  })
})
