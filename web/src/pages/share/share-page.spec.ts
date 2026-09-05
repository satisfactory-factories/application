import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import SharePage from './[id].vue'
import vuetify from '@/plugins/vuetify'
import { useAppStore } from '@/stores/app-store'
import type { FactoryTab } from '@/interfaces/planner/FactoryInterface'

const routing = vi.hoisted(() => ({ id: 'share-1', push: vi.fn() }))

vi.mock('vue-router', async importOriginal => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return { ...actual, useRoute: () => ({ params: { id: routing.id } }) }
})

vi.mock('@/router', () => ({ default: { push: routing.push } }))

// The id a snapshot carries is the tab it was taken from, which under v0.7 is a room id.
const SOURCE_TAB_ID = '11111111-2222-3333-4444-555555555555'

const shared = (tab: Partial<FactoryTab>) => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    headers: new Headers(),
    json: async () => ({ data: tab }),
  }) as unknown as typeof fetch
}

const openShareLink = async () => {
  const pinia = createTestingPinia({ createSpy: vi.fn })
  setActivePinia(pinia)
  const appStore = useAppStore()
  mount(SharePage, { global: { plugins: [vuetify, pinia] } })
  await flushPromises()
  return appStore
}

describe('/share/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('imports a snapshot under an id of its own, never the tab it was taken from', async () => {
    shared({ id: SOURCE_TAB_ID, name: 'Steel Works', factories: [] })

    const appStore = await openShareLink()

    expect(appStore.addTab).toHaveBeenCalledTimes(1)
    const [imported] = vi.mocked(appStore.addTab).mock.calls[0] as [Partial<FactoryTab>]
    expect(imported.id).toBeTruthy()
    expect(imported.id).not.toBe(SOURCE_TAB_ID)
    expect(imported.name).toBe('Steel Works (shared)')
  })

  it('keeps the rest of the shared plan exactly as it arrived', async () => {
    shared({
      id: SOURCE_TAB_ID,
      name: 'Steel Works',
      factories: [],
      powerTarget: 1200,
      plannerVersion: '0.6',
    })

    const appStore = await openShareLink()

    const [imported] = vi.mocked(appStore.addTab).mock.calls[0] as [Partial<FactoryTab>]
    expect(imported.powerTarget).toBe(1200)
    expect(imported.plannerVersion).toBe('0.6')
  })
})
