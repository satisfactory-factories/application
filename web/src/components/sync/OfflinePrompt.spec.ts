import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import OfflinePrompt from './OfflinePrompt.vue'
import vuetify from '@/plugins/vuetify'
import { useBackendHealthStore } from '@/stores/backend-health-store'
import { useRoomSyncStore } from '@/stores/room-sync-store'
import { OFFLINE_PROMPT_DECLINED_KEY, resetWarningDismissals } from '@/sync/warning-dismissals'

describe('OfflinePrompt', () => {
  let roomSync: ReturnType<typeof useRoomSyncStore>
  let health: ReturnType<typeof useBackendHealthStore>

  /** The socket has given up reconnecting, with an edit waiting to go out. */
  let siteAnswers = true
  const fetchMock = vi.fn(async () => {
    if (!siteAnswers) throw new TypeError('Failed to fetch')
    return { ok: true } as Response
  })

  const render = async (unsynced = true) => {
    const pinia = createTestingPinia({ createSpy: vi.fn })
    setActivePinia(pinia)
    roomSync = useRoomSyncStore()
    health = useBackendHealthStore()
    roomSync.mode = 'offlinePrompt'
    // @ts-expect-error a getter, writable under @pinia/testing
    roomSync.hasUnsyncedEdits = unsynced
    const wrapper = mount(OfflinePrompt, { global: { plugins: [vuetify, pinia] } })
    await flushPromises()
    return wrapper
  }

  const prompt = (wrapper: Awaited<ReturnType<typeof render>>) => wrapper.find('[data-testid="offline-prompt"]')

  beforeEach(() => {
    sessionStorage.clear()
    resetWarningDismissals()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    siteAnswers = true
    fetchMock.mockClear()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('blames SF\'s servers when the site itself still answers', async () => {
    const text = prompt(await render()).text()

    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/^\/robots\.txt\?probe=/), expect.objectContaining({ cache: 'no-store' }))
    expect(text).toContain('Can\'t reach SF\'s servers right now')
    expect(text).not.toContain('You appear to be offline')
  })

  it('says the reader is offline when the site itself does not answer either', async () => {
    siteAnswers = false

    expect(prompt(await render()).text()).toContain('You appear to be offline')
  })

  it('says the reader is offline without asking when the browser already knows', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    expect(prompt(await render()).text()).toContain('You appear to be offline')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stays down with nothing waiting to sync', async () => {
    expect(prompt(await render(false)).exists()).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('leaves a known server outage to the backend warning', async () => {
    const wrapper = await render()
    health.unhealthy = true
    await nextTick()

    expect(prompt(wrapper).exists()).toBe(false)
  })

  it('holds "Not now" for the tab session, even when the offer comes round again', async () => {
    const wrapper = await render()
    await wrapper.find('[data-testid="offline-decline"]').trigger('click')

    expect(roomSync.dismissOfflinePrompt).toHaveBeenCalled()
    expect(sessionStorage.getItem(OFFLINE_PROMPT_DECLINED_KEY)).toBe('true')

    // Three more failed reconnects put the store back in offlinePrompt.
    roomSync.mode = 'reconnecting'
    await nextTick()
    roomSync.mode = 'offlinePrompt'
    await flushPromises()
    expect(prompt(wrapper).exists()).toBe(false)
  })

  it('goes offline from its button', async () => {
    const wrapper = await render()
    await wrapper.find('[data-testid="offline-accept"]').trigger('click')

    expect(roomSync.enterOffline).toHaveBeenCalled()
  })
})
