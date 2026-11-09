import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import OfflineReturnPrompt from './OfflineReturnPrompt.vue'
import vuetify from '@/plugins/vuetify'
import { useRoomSyncStore } from '@/stores/room-sync-store'
import { SERVICE_NOTICE, serviceNoticeDismissedKey } from '@/config/service-notice'
import {
  OFFLINE_MODE_KEY,
  OFFLINE_RETURN_OFFERED_KEY,
  OFFLINE_RETURN_PROMPT_MS,
} from '@/sync/offline-mode'

describe('OfflineReturnPrompt', () => {
  let roomSync: ReturnType<typeof useRoomSyncStore>
  const mounted: ReturnType<typeof mount>[] = []

  /** A page opening, with whatever this browser already remembers. */
  const open = async () => {
    roomSync?.dispose()
    setActivePinia(createPinia())
    roomSync = useRoomSyncStore()
    const wrapper = mount(OfflineReturnPrompt, { global: { plugins: [vuetify] } })
    mounted.push(wrapper)
    // It decides on mount, so what it decided is drawn a tick later.
    await nextTick()
    return wrapper
  }

  const prompt = (wrapper: Awaited<ReturnType<typeof open>>) =>
    wrapper.find('[data-testid="offline-return-prompt"]')

  /** Whatever service notice is configured has been answered, unless a case says otherwise. */
  const answerServiceNotice = () => {
    if (SERVICE_NOTICE) localStorage.setItem(serviceNoticeDismissedKey(SERVICE_NOTICE.id), 'true')
  }

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    answerServiceNotice()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  })

  afterEach(() => {
    for (const wrapper of mounted.splice(0)) wrapper.unmount()
    roomSync?.dispose()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('offers the way back online when the page opens in offline mode with network', async () => {
    localStorage.setItem(OFFLINE_MODE_KEY, 'true')

    const wrapper = await open()

    expect(prompt(wrapper).exists()).toBe(true)
    expect(prompt(wrapper).text()).toContain('You\'re still in offline mode')
    expect(prompt(wrapper).text()).toContain('Go back online?')
  })

  it('stands down for an unanswered "backend issues fixed" notice, which asks the same thing', async () => {
    localStorage.setItem(OFFLINE_MODE_KEY, 'true')
    if (SERVICE_NOTICE?.kind !== 'resolved') return
    localStorage.removeItem(serviceNoticeDismissedKey(SERVICE_NOTICE.id))

    const wrapper = await open()

    expect(prompt(wrapper).exists()).toBe(false)
    // Not spent: a reader who answers the notice by staying offline is reminded next sitting.
    expect(sessionStorage.getItem(OFFLINE_RETURN_OFFERED_KEY)).toBeNull()
  })

  it('goes back online from its button', async () => {
    localStorage.setItem(OFFLINE_MODE_KEY, 'true')
    const wrapper = await open()

    await wrapper.find('[data-testid="offline-return-accept"]').trigger('click')
    await flushPromises()

    expect(roomSync.isOffline).toBe(false)
    expect(localStorage.getItem(OFFLINE_MODE_KEY)).toBeNull()
    expect(prompt(wrapper).exists()).toBe(false)
  })

  it('stays offline, quietly, when told to', async () => {
    localStorage.setItem(OFFLINE_MODE_KEY, 'true')
    const wrapper = await open()

    await wrapper.find('[data-testid="offline-return-decline"]').trigger('click')

    expect(roomSync.isOffline).toBe(true)
    expect(prompt(wrapper).exists()).toBe(false)
  })

  it('goes away on its own after a while', async () => {
    vi.useFakeTimers()
    localStorage.setItem(OFFLINE_MODE_KEY, 'true')
    const wrapper = await open()
    expect(prompt(wrapper).exists()).toBe(true)

    await vi.advanceTimersByTimeAsync(OFFLINE_RETURN_PROMPT_MS)

    expect(prompt(wrapper).exists()).toBe(false)
    expect(roomSync.isOffline).toBe(true)
  })

  it('asks once per session, not on every reload', async () => {
    localStorage.setItem(OFFLINE_MODE_KEY, 'true')
    expect(prompt(await open()).exists()).toBe(true)
    expect(sessionStorage.getItem(OFFLINE_RETURN_OFFERED_KEY)).toBe('true')

    expect(prompt(await open()).exists()).toBe(false)
  })

  it('says nothing when the browser has no network to go back to', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    localStorage.setItem(OFFLINE_MODE_KEY, 'true')

    expect(prompt(await open()).exists()).toBe(false)
    // Not spent either: the offer is still owed for when the network is there.
    expect(sessionStorage.getItem(OFFLINE_RETURN_OFFERED_KEY)).toBeNull()
  })

  it('says nothing on a page that opened online', async () => {
    expect(prompt(await open()).exists()).toBe(false)
  })

  it('goes away when offline mode is turned off some other way', async () => {
    localStorage.setItem(OFFLINE_MODE_KEY, 'true')
    const wrapper = await open()

    roomSync.exitOffline()
    await flushPromises()

    expect(prompt(wrapper).exists()).toBe(false)
  })
})
