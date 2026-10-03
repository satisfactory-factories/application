import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import LastUpdatedIndicator from './LastUpdatedIndicator.vue'
import vuetify from '@/plugins/vuetify'
import { useAppStore } from '@/stores/app-store'
import { usePlanActivityStore } from '@/stores/plan-activity-store'

describe('LastUpdatedIndicator', () => {
  let appStore: ReturnType<typeof useAppStore>
  let activity: ReturnType<typeof usePlanActivityStore>

  const render = () => mount(LastUpdatedIndicator, { global: { plugins: [vuetify] } })

  const value = (wrapper: ReturnType<typeof render>) =>
    wrapper.find('[data-testid="last-updated-value"]')

  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
    setActivePinia(createPinia())

    appStore = useAppStore()
    appStore.isLoaded = true
    activity = usePlanActivityStore()
  })

  afterEach(() => {
    activity.dispose()
    vi.useRealTimers()
  })

  it('says the plan has not changed yet when nothing has', () => {
    const wrapper = render()

    expect(wrapper.text()).toContain('Last updated:')
    expect(value(wrapper).text()).toBe('not yet')
  })

  it('reads a stamp this browser already had, without flashing at it', async () => {
    activity.bump(appStore.currentFactoryTab.id, Date.now() - 5 * 60_000)

    const wrapper = render()
    await nextTick()

    expect(value(wrapper).text()).toContain('5')
    expect(value(wrapper).classes()).not.toContain('is-flashing')
  })

  it('flashes when the plan changes, and stops flashing on its own', async () => {
    activity.bump(appStore.currentFactoryTab.id, Date.now() - 60_000)
    const wrapper = render()
    await nextTick()

    activity.bump(appStore.currentFactoryTab.id, Date.now())
    await nextTick()

    expect(value(wrapper).classes()).toContain('is-flashing')

    vi.advanceTimersByTime(2000)
    await nextTick()

    expect(value(wrapper).classes()).not.toContain('is-flashing')
  })

  it('follows the tab the user is looking at', async () => {
    const other = appStore.addTab({ name: 'Second', factories: [] }, { activate: false })
    activity.bump(other, Date.now() - 30 * 60_000)

    const wrapper = render()
    expect(value(wrapper).text()).toBe('not yet')

    appStore.activateTab(other)
    await nextTick()

    expect(value(wrapper).text()).toContain('30')
  })
})
