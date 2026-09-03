import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import LegacyRecoveryDialog from './LegacyRecoveryDialog.vue'
import vuetify from '@/plugins/vuetify'
import { useRoomsStore } from '@/stores/rooms-store'

// v-dialog teleports its content to the body, so everything is read from there.
const body = () => document.body
const click = async (testId: string) => {
  body().querySelector<HTMLElement>(`[data-testid="${testId}"]`)?.click()
  await flushPromises()
}

describe('LegacyRecoveryDialog', () => {
  let roomsStore: ReturnType<typeof useRoomsStore>
  let pinia: ReturnType<typeof createPinia>

  const open = async (factoryCount = 42) => {
    roomsStore.legacyFactoryCount = factoryCount
    roomsStore.legacyOpen = true

    const wrapper = mount(LegacyRecoveryDialog, {
      global: { plugins: [vuetify, pinia] },
      attachTo: document.body,
    })
    await flushPromises()
    return wrapper
  }

  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    vi.clearAllMocks()
    pinia = createPinia()
    setActivePinia(pinia)

    roomsStore = useRoomsStore()
  })

  it('asks about the plan the account saved before v0.7', async () => {
    await open()

    expect(body().textContent).toContain('Recover your old plan?')
    expect(body().textContent).toContain('from before v0.7')
  })

  it('names how big the old plan is', async () => {
    await open(162)

    expect(body().querySelector('[data-testid="legacy-factory-count"]')?.textContent)
      .toBe('162 factories')
  })

  it('counts a one-factory plan in the singular', async () => {
    await open(1)

    expect(body().querySelector('[data-testid="legacy-factory-count"]')?.textContent)
      .toBe('1 factory')
  })

  it('stays shut while nothing has been offered', async () => {
    roomsStore.legacyOpen = false
    mount(LegacyRecoveryDialog, { global: { plugins: [vuetify, pinia] }, attachTo: document.body })
    await flushPromises()

    expect(body().querySelector('[data-testid="legacy-recovery-dialog"]')).toBeNull()
  })

  it('imports the plan on the primary action', async () => {
    const importPlan = vi.spyOn(roomsStore, 'importLegacyPlan').mockResolvedValue(true)
    await open()

    await click('legacy-submit')

    expect(importPlan).toHaveBeenCalled()
  })

  it('"Not now" closes the offer and imports nothing', async () => {
    const close = vi.spyOn(roomsStore, 'closeLegacyOffer')
    const importPlan = vi.spyOn(roomsStore, 'importLegacyPlan')
    await open()

    await click('legacy-decline')

    expect(close).toHaveBeenCalled()
    expect(importPlan).not.toHaveBeenCalled()
  })

  it('holds both buttons while the import runs', async () => {
    await open()
    roomsStore.legacyImporting = true
    await flushPromises()

    const decline = body().querySelector<HTMLButtonElement>('[data-testid="legacy-decline"]')
    expect(decline?.disabled).toBe(true)
    expect(body().querySelector('[data-testid="legacy-submit"]')?.className)
      .toContain('v-btn--loading')
  })
})
