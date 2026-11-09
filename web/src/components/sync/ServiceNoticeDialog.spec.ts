import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import ServiceNoticeDialog from './ServiceNoticeDialog.vue'
import vuetify from '@/plugins/vuetify'
import eventBus from '@/utils/eventBus'
import { serviceNoticeDismissedKey } from '@/config/service-notice'
import type { ServiceNotice } from '@/config/service-notice'
import { useAppStore } from '@/stores/app-store'
import { useAuthStore } from '@/stores/auth-store'
import { useRoomSyncStore } from '@/stores/room-sync-store'

const OUTAGE: ServiceNotice = { id: 'test-outage', kind: 'outage' }
const RESOLVED: ServiceNotice = { id: 'test-resolved', kind: 'resolved' }

describe('ServiceNoticeDialog', () => {
  let roomSync: ReturnType<typeof useRoomSyncStore>
  const mounted: ReturnType<typeof mount>[] = []

  interface Options {
    loggedIn?: boolean
    tabKinds?: Array<'local' | 'synced' | 'joined'>
    offline?: boolean
  }

  /** A page opening, then its plan finishing loading, which is what puts the notice up. */
  const open = async (notice: ServiceNotice | null, options: Options = {}) => {
    const { loggedIn = true, tabKinds = ['local'], offline = false } = options
    const pinia = createTestingPinia({ createSpy: vi.fn })
    setActivePinia(pinia)

    const auth = useAuthStore()
    // @ts-expect-error a getter, writable under @pinia/testing
    auth.isLoggedIn = loggedIn
    const appStore = useAppStore()
    vi.mocked(appStore.getTabs).mockReturnValue(tabKinds.map((_, i) => ({ id: `tab-${i}` })) as never)
    vi.mocked(appStore.getTabState).mockImplementation(
      (id: string) => ({ kind: tabKinds[Number(id.split('-')[1])] }) as never,
    )
    roomSync = useRoomSyncStore()
    // @ts-expect-error a getter, writable under @pinia/testing
    roomSync.isOffline = offline

    const wrapper = mount(ServiceNoticeDialog, {
      props: { notice },
      global: { plugins: [vuetify, pinia] },
      attachTo: document.body,
    })
    mounted.push(wrapper)

    eventBus.emit('loadingCompleted')
    vi.advanceTimersByTime(1_000)
    await nextTick()
    await nextTick()
    return wrapper
  }

  const dialog = () => document.querySelector('[data-testid="service-notice-dialog"]')
  const click = (testId: string) =>
    (document.querySelector(`[data-testid="${testId}"]`) as HTMLElement).click()

  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    localStorage.setItem('seenV7Splash', 'true')
  })

  afterEach(() => {
    for (const wrapper of mounted.splice(0)) wrapper.unmount()
    vi.useRealTimers()
  })

  it('tells a signed-in reader about the outage once their plan has loaded', async () => {
    await open(OUTAGE)

    const text = dialog()?.textContent ?? ''
    expect(text).toContain('connectivity issues')
    expect(text).toContain('packet loss')
    expect(text).toContain('we recommend switching to offline mode')
    expect(text).toContain('without the "SF backend offline" warnings')
    expect(text).toContain('Links you have already shared keep working')
    expect(text).toContain('Syncing across your devices and collaborating on shared plans will not work')
    expect(text).toContain('will not be backed up to SF')
    expect(document.querySelector('[data-testid="service-notice-collab-warning"]')?.classList)
      .toContain('text-red')
    expect(text).toContain('nothing is lost')
    expect(text).toContain('more than a week')
    expect(text).toContain('join us on Discord')
    expect(document.querySelector('[data-testid="service-notice-discord"]')?.getAttribute('href'))
      .toBe('https://discord.gg/vcFsjcWAFv')
  })

  it('goes offline from its button and is not shown again', async () => {
    await open(OUTAGE)
    click('service-notice-offline')

    expect(roomSync.enterOffline).toHaveBeenCalled()
    expect(localStorage.getItem(serviceNoticeDismissedKey(OUTAGE.id))).toBe('true')
  })

  it('remembers "Stay online" without going offline', async () => {
    await open(OUTAGE)
    click('service-notice-dismiss')

    expect(roomSync.enterOffline).not.toHaveBeenCalled()
    expect(localStorage.getItem(serviceNoticeDismissedKey(OUTAGE.id))).toBe('true')
  })

  it('stays away once answered', async () => {
    localStorage.setItem(serviceNoticeDismissedKey(OUTAGE.id), 'true')
    await open(OUTAGE)

    expect(dialog()).toBeNull()
  })

  it('reaches anyone holding a synced or joined tab, even signed out', async () => {
    await open(OUTAGE, { loggedIn: false, tabKinds: ['local', 'joined'] })

    expect(dialog()).not.toBeNull()
  })

  it('leaves a signed-out reader with only local tabs alone', async () => {
    await open(OUTAGE, { loggedIn: false, tabKinds: ['local'] })

    expect(dialog()).toBeNull()
  })

  it('has nothing to add for someone already in offline mode', async () => {
    await open(OUTAGE, { offline: true })

    expect(dialog()).toBeNull()
  })

  it('waits for the release deck to be out of the way', async () => {
    localStorage.removeItem('seenV7Splash')
    await open(OUTAGE)

    expect(dialog()).toBeNull()
  })

  it('shows nothing when switched off', async () => {
    await open(null)

    expect(dialog()).toBeNull()
  })

  it('offers the way back online once resolved, to someone still offline', async () => {
    await open(RESOLVED, { offline: true })

    const text = dialog()?.textContent ?? ''
    expect(text).toContain('SF\'s backend issues have been fixed')
    expect(text).toContain('please consider going back online')
    click('service-notice-online')

    expect(roomSync.exitOffline).toHaveBeenCalled()
    expect(localStorage.getItem(serviceNoticeDismissedKey(RESOLVED.id))).toBe('true')
  })

  it('says nothing about the fix to someone already online', async () => {
    await open(RESOLVED, { offline: false })

    expect(dialog()).toBeNull()
  })

  it('reaches anyone in offline mode with the fix, signed in or not', async () => {
    await open(RESOLVED, { offline: true, loggedIn: false, tabKinds: ['local'] })

    expect(dialog()).not.toBeNull()
  })

  it('lets someone stay offline, and remembers the answer', async () => {
    await open(RESOLVED, { offline: true })
    click('service-notice-dismiss')

    expect(roomSync.exitOffline).not.toHaveBeenCalled()
    expect(localStorage.getItem(serviceNoticeDismissedKey(RESOLVED.id))).toBe('true')
  })
})
