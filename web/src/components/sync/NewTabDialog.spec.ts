import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import type { RoomListEntry } from 'common'
import NewTabDialog from './NewTabDialog.vue'
import vuetify from '@/plugins/vuetify'
import { useAppStore } from '@/stores/app-store'
import { useAuthStore } from '@/stores/auth-store'
import { useRoomsStore } from '@/stores/rooms-store'

// The dialog teleports its content out of the wrapper, so everything is read from
// the body, exactly as a person sees it.
const body = () => document.body
const at = (testId: string) => body().querySelector<HTMLElement>(`[data-testid="${testId}"]`)
const all = (testId: string) => [...body().querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`)]
const shown = (testId: string) => at(testId) !== null

const entry = (roomId: string, overrides: Partial<RoomListEntry> = {}): RoomListEntry => ({
  roomId,
  name: 'Plan',
  slug: null,
  shared: false,
  hasPassword: false,
  revision: 3,
  role: 'owner',
  order: 0,
  lastActivityAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  factoryCount: 2,
  ...overrides,
})

describe('NewTabDialog', () => {
  let appStore: ReturnType<typeof useAppStore>
  let authStore: ReturnType<typeof useAuthStore>
  let roomsStore: ReturnType<typeof useRoomsStore>

  const render = ({ loggedIn = false, rooms = [] as RoomListEntry[], openTabs = [] as string[] } = {}) => {
    const pinia = createTestingPinia({ createSpy: vi.fn })
    setActivePinia(pinia)

    appStore = useAppStore()
    authStore = useAuthStore()
    roomsStore = useRoomsStore()
    authStore.token = loggedIn ? 'token' : ''
    authStore.loggedInUser = loggedIn ? 'pioneer' : ''

    vi.mocked(roomsStore.createSyncedTab).mockResolvedValue(true)
    vi.mocked(roomsStore.whenSessionReady).mockResolvedValue(undefined)
    vi.mocked(roomsStore.openPlan).mockResolvedValue(true)
    vi.mocked(roomsStore.refresh).mockResolvedValue(true)
    // The bar is the open set: a plan with a tab here is not on offer.
    const open = new Set(openTabs)
    vi.mocked(appStore.getTab).mockImplementation(
      id => open.has(id) ? { id, name: 'Open', factories: [] } as never : undefined as never,
    )
    for (const room of rooms) roomsStore.entries[room.roomId] = room

    return mount(NewTabDialog, {
      global: { plugins: [vuetify, pinia] },
      props: { modelValue: true },
      attachTo: document.body,
    })
  }

  /** Signs in through the form the dialog shows, as a person would. */
  const signIn = async () => {
    vi.mocked(authStore.login).mockImplementation(async () => {
      authStore.token = 'token'
      authStore.loggedInUser = 'pioneer'
      return true
    })

    const fields = body().querySelectorAll<HTMLInputElement>('[data-testid="auth-form"] input')
    for (const [index, value] of ['pioneer', 'ficsit'].entries()) {
      fields[index].value = value
      fields[index].dispatchEvent(new Event('input', { bubbles: true }))
    }
    await flushPromises()

    body().querySelector<HTMLFormElement>('[data-testid="auth-form"] form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
  }

  const chooseSynced = async () => {
    at('choose-synced-tab')?.click()
    await flushPromises()
  }

  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('offers both kinds of tab', () => {
    render()

    expect(shown('choose-local-tab')).toBe(true)
    expect(shown('choose-synced-tab')).toBe(true)
  })

  // The tab-kind icons are one language everywhere: desktop for local, cloud for
  // synced. The choice cards teach it, so they have to speak it.
  it('marks the choices with the tab-kind icons', () => {
    render()

    expect(at('choose-local-tab')?.querySelector('.fa-desktop')).not.toBeNull()
    expect(at('choose-synced-tab')?.querySelector('.fa-cloud')).not.toBeNull()
    expect(at('choose-synced-tab')?.querySelector('.fa-user')).toBeNull()
  })

  // The two cards are the whole dialog, and a v-card with a click handler is not a
  // button: without these a keyboard cycles straight past both choices to Cancel.
  describe('reaching the choices from the keyboard', () => {
    const press = async (testId: string, key: string) => {
      at(testId)?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
      await flushPromises()
    }

    it('puts both choices in the tab order and announces them as buttons', () => {
      render()

      for (const testId of ['choose-local-tab', 'choose-synced-tab']) {
        expect(at(testId)?.getAttribute('tabindex')).toBe('0')
        expect(at(testId)?.getAttribute('role')).toBe('button')
      }
    })

    it('takes the local choice on Enter', async () => {
      render()

      await press('choose-local-tab', 'Enter')

      expect(appStore.addTab).toHaveBeenCalled()
    })

    it('takes the synced choice on Space', async () => {
      render({ loggedIn: true })

      await press('choose-synced-tab', ' ')

      expect(roomsStore.createSyncedTab).toHaveBeenCalledWith('New Tab')
    })
  })

  it('makes a local tab with no account at all', async () => {
    const wrapper = render()

    at('choose-local-tab')?.click()
    await flushPromises()

    expect(appStore.addTab).toHaveBeenCalled()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })

  describe('signed out, choosing synced', () => {
    it('offers the sign-in form here rather than turning the choice down', async () => {
      render()

      expect(shown('synced-needs-account')).toBe(true)
      await chooseSynced()

      expect(shown('auth-form')).toBe(true)
      expect(shown('choose-synced-tab')).toBe(false)
      expect(roomsStore.createSyncedTab).not.toHaveBeenCalled()
    })

    it('carries on and makes the tab once the sign-in lands, without asking again', async () => {
      const wrapper = render()
      await chooseSynced()

      await signIn()

      expect(authStore.login).toHaveBeenCalledWith('pioneer', 'ficsit')
      expect(roomsStore.createSyncedTab).toHaveBeenCalledWith('New Tab')
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
    })

    // The room list refresh that login starts converts a synced tab it does not
    // know about straight back to local, so the tab is made after it lands.
    it('waits for the room list before making the tab', async () => {
      render()
      await chooseSynced()

      await signIn()

      const waited = vi.mocked(roomsStore.whenSessionReady).mock.invocationCallOrder[0]
      const created = vi.mocked(roomsStore.createSyncedTab).mock.invocationCallOrder[0]
      expect(waited).toBeLessThan(created)
    })

    it('goes back to the chooser rather than trapping the user in the form', async () => {
      render()
      await chooseSynced()

      at('new-tab-back')?.click()
      await flushPromises()

      expect(shown('auth-form')).toBe(false)
      expect(shown('choose-local-tab')).toBe(true)
    })
  })

  describe('signed in', () => {
    it('creates the tab straight away', async () => {
      const wrapper = render({ loggedIn: true })

      expect(shown('synced-needs-account')).toBe(false)
      await chooseSynced()

      expect(shown('auth-form')).toBe(false)
      expect(roomsStore.createSyncedTab).toHaveBeenCalledWith('New Tab')
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
    })

    it('stays open and shows why when the server refuses', async () => {
      const wrapper = render({ loggedIn: true })
      vi.mocked(roomsStore.createSyncedTab).mockResolvedValue('You have too many synced plans.')

      await chooseSynced()

      expect(at('new-tab-error')?.textContent).toContain('too many synced plans')
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })
  })

  /**
   * The third way into a cloud plan, after the login chooser and the account
   * panel: the plus button lists what this browser has closed, because that is
   * where someone goes when they want a tab they have not got.
   */
  describe('opening a plan already on the account', () => {
    it('lists the plans with no tab in this browser, in membership order', () => {
      render({
        loggedIn: true,
        rooms: [entry('room-2', { name: 'Second', order: 1 }), entry('room-1', { name: 'First', order: 0 })],
      })

      // The row's first span is the plan's name; the rest of it is the Show
      // button and the size/last-changed line.
      expect(all('unopened-plan').map(row => row.querySelector('span')?.textContent))
        .toEqual(['First', 'Second'])
    })

    it('leaves out the plans this browser already holds', () => {
      render({
        loggedIn: true,
        rooms: [entry('room-1', { name: 'Open here' }), entry('room-2', { name: 'Closed here' })],
        openTabs: ['room-1'],
      })

      expect(all('unopened-plan')).toHaveLength(1)
      expect(at('unopened-plan')?.textContent).toContain('Closed here')
    })

    it('opens the one whose Show button is pressed, and gets out of the way', async () => {
      const wrapper = render({ loggedIn: true, rooms: [entry('room-1'), entry('room-2')] })

      body().querySelector<HTMLElement>('[data-testid="show-plan"][data-room-id="room-2"]')?.click()
      await flushPromises()

      expect(roomsStore.openPlan).toHaveBeenCalledWith('room-2')
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
    })

    it('stays open and says why when the plan cannot be opened', async () => {
      const wrapper = render({ loggedIn: true, rooms: [entry('room-1')] })
      vi.mocked(roomsStore.openPlan).mockResolvedValue('That plan is not on your account.')

      body().querySelector<HTMLElement>('[data-testid="show-plan"][data-room-id="room-1"]')?.click()
      await flushPromises()

      expect(at('new-tab-error')?.textContent).toContain('not on your account')
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    // A plan made on another device since the last refresh is exactly what the
    // person opening this dialog is reaching for.
    it('refreshes the account list as it opens', () => {
      render({ loggedIn: true, rooms: [entry('room-1')] })

      expect(roomsStore.refresh).toHaveBeenCalled()
    })

    it('offers nothing of the sort to a signed-out browser', () => {
      render({ rooms: [entry('room-1')] })

      expect(shown('open-existing-plans')).toBe(false)
      expect(roomsStore.refresh).not.toHaveBeenCalled()
    })

    it('says nothing at all when every account plan is already open here', () => {
      render({ loggedIn: true, rooms: [entry('room-1')], openTabs: ['room-1'] })

      expect(shown('open-existing-plans')).toBe(false)
    })
  })
})
