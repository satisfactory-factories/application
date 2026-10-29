import vuetify from '@/plugins/vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StatisticsFactorySummary from './StatisticsFactorySummary.vue'
import { newFactory } from '@/utils/factory-management/factory'
import eventBus from '@/utils/eventBus'

describe('Component: StatisticsFactorySummary', () => {
  const mountSubject = (dialogOnly = false) =>
    mount(StatisticsFactorySummary, {
      props: { factories: [newFactory('Iron')], dialogOnly },
      attachTo: document.body,
      global: { plugins: [vuetify], provide: { navigateToFactory: vi.fn() } },
    })

  let subject: ReturnType<typeof mountSubject> | undefined

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    subject?.unmount()
    subject = undefined
  })

  const dialogShown = () => document.body.textContent?.includes('Factories Summary') ?? false

  it('renders the overview section by default', () => {
    subject = mountSubject()

    expect(subject.find('#factory-summary').exists()).toBe(true)
  })

  // A factory page has no overview section to hold the dialog, so it mounts this half alone. The
  // sidebar's expand buttons open it from there, and did nothing at all when nothing was listening.
  describe('dialog only', () => {
    it('leaves the section out', () => {
      subject = mountSubject(true)

      expect(subject.find('#factory-summary').exists()).toBe(false)
      expect(dialogShown()).toBe(false)
    })

    it('opens the fullscreen summary when the sidebar asks for it', async () => {
      subject = mountSubject(true)

      eventBus.emit('openSummaryFullscreen', undefined)
      await flushPromises()

      expect(dialogShown()).toBe(true)
    })
  })
})
