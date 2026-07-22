import vuetify from '@/plugins/vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { mount, VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PlannerGlobalActions from './PlannerGlobalActions.vue'
import { useAppStore } from '@/stores/app-store'
import { usePowerTarget } from '@/composables/usePowerTarget'
import { newFactory } from '@/utils/factory-management/factory'

// The copy/paste plan buttons must carry the plan's power target (a tab-level
// field) alongside the factories, while still accepting the legacy array-only blob.
describe('Component: PlannerGlobalActions clipboard', () => {
  let appStore: ReturnType<typeof useAppStore>
  let readText: ReturnType<typeof vi.fn>
  let writeText: ReturnType<typeof vi.fn>

  const mountSubject = () =>
    mount(PlannerGlobalActions, {
      propsData: { helpTextShown: false },
      global: {
        plugins: [vuetify],
        stubs: { Templates: true },
      },
    })

  const clickButton = (subject: VueWrapper, text: string) => {
    const button = subject.findAll('button').find(b => b.text().includes(text))
    if (!button) throw new Error(`Button "${text}" not found`)
    return button.trigger('click')
  }

  const seedFactory = () => {
    // Give the current tab a factory so the (disabled-when-empty) Copy button is live,
    // then trigger init so getFactories() returns it.
    appStore.getCurrentTab().factories = [newFactory('Test')]
    appStore.getFactories()
  }

  beforeEach(() => {
    localStorage.removeItem('factoryTabs')
    setActivePinia(createPinia())
    appStore = useAppStore()

    writeText = vi.fn()
    readText = vi.fn()
    vi.stubGlobal('navigator', { clipboard: { writeText, readText } })
    // confirmReplace() calls window.confirm when a plan already exists.
    vi.stubGlobal('confirm', vi.fn(() => true))
  })

  it('copy serializes the full tab (name, factories, powerTarget)', () => {
    seedFactory()
    appStore.getCurrentTab().name = 'My Plan'
    usePowerTarget().powerTarget.value = 5000

    const subject = mountSubject()
    clickButton(subject, 'Copy plan')

    expect(writeText).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(writeText.mock.calls[0][0])
    expect(payload.name).toBe('My Plan')
    expect(payload.powerTarget).toBe(5000)
    expect(Array.isArray(payload.factories)).toBe(true)
    expect(payload.factories).toHaveLength(1)
  })

  it('paste of a full tab replaces the current tab name, target and factories', async () => {
    seedFactory()
    appStore.getCurrentTab().name = 'Original'
    const prepareLoader = vi.spyOn(appStore, 'prepareLoader').mockResolvedValue(undefined)
    readText.mockResolvedValue(JSON.stringify({ name: 'Pasted Plan', factories: [newFactory('Pasted')], powerTarget: 1234 }))

    const subject = mountSubject()
    await clickButton(subject, 'Paste plan')
    await new Promise(resolve => setTimeout(resolve, 300))

    expect(prepareLoader).toHaveBeenCalledTimes(1)
    expect(prepareLoader.mock.calls[0][0]).toHaveLength(1)
    expect(appStore.getCurrentTab().powerTarget).toBe(1234)
    expect(appStore.getCurrentTab().name).toBe('Pasted Plan')
  })

  it('paste of a legacy array loads factories and leaves tab settings untouched', async () => {
    seedFactory()
    appStore.getCurrentTab().name = 'Keep Me'
    usePowerTarget().powerTarget.value = 4000
    const prepareLoader = vi.spyOn(appStore, 'prepareLoader').mockResolvedValue(undefined)
    readText.mockResolvedValue(JSON.stringify([newFactory('Legacy')]))

    const subject = mountSubject()
    await clickButton(subject, 'Paste plan')
    await new Promise(resolve => setTimeout(resolve, 300))

    expect(prepareLoader).toHaveBeenCalledTimes(1)
    expect(prepareLoader.mock.calls[0][0]).toHaveLength(1)
    // Legacy blobs carry no name/target, so the existing tab settings are preserved.
    expect(appStore.getCurrentTab().powerTarget).toBe(4000)
    expect(appStore.getCurrentTab().name).toBe('Keep Me')
  })
})
