import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import type { RoomListEntry } from 'common'
import AccountPanel from './AccountPanel.vue'
import ShareDialog from './ShareDialog.vue'
import vuetify from '@/plugins/vuetify'
import type { FactoryTab } from '@/interfaces/planner/FactoryInterface'
import { useAppStore } from '@/stores/app-store'
import { useAuthStore } from '@/stores/auth-store'
import { useRoomSyncStore } from '@/stores/room-sync-store'
import { useRoomsStore } from '@/stores/rooms-store'
import { LOCAL_TAB_STATE, type TabSyncStateMap } from '@/sync/tab-sync-state'
import { relativeTime } from '@/utils/relative-time'

const entry = (overrides: Partial<RoomListEntry> = {}): RoomListEntry => ({
  roomId: 'room-1',
  name: 'Iron Plates',
  slug: null,
  shared: false,
  hasPassword: false,
  revision: 3,
  role: 'owner',
  order: 0,
  lastActivityAt: '2026-08-31T11:00:00.000Z',
  ...overrides,
})

const tab = (id: string, name: string): FactoryTab =>
  ({ id, name, factories: [] } as unknown as FactoryTab)

describe('AccountPanel', () => {
  let appStore: ReturnType<typeof useAppStore>
  let authStore: ReturnType<typeof useAuthStore>
  let roomsStore: ReturnType<typeof useRoomsStore>
  let roomSync: ReturnType<typeof useRoomSyncStore>

  const render = (
    initialState: Record<string, unknown> = {},
    { open = true, tabs = [] as FactoryTab[], tabStates = {} as TabSyncStateMap } = {},
  ) => {
    const pinia = createTestingPinia({ createSpy: vi.fn, initialState })
    setActivePinia(pinia)

    authStore = useAuthStore()
    authStore.token = 'token'
    authStore.loggedInUser = 'pioneer'
    roomsStore = useRoomsStore()
    roomSync = useRoomSyncStore()

    // Testing pinia stubs actions, so the two reads the panel makes are re-wired
    // to answer from the fixture handed in.
    appStore = useAppStore()
    vi.mocked(appStore.getTabs).mockImplementation(() => tabs)
    vi.mocked(appStore.getTabState).mockImplementation(tabId => tabStates[tabId] ?? LOCAL_TAB_STATE)

    return mount(AccountPanel, { global: { plugins: [vuetify, pinia] }, props: { open } })
  }

  type Panel = ReturnType<typeof render>

  const at = (wrapper: Panel, testId: string) => wrapper.find(`[data-testid="${testId}"]`)

  const openCloud = async (wrapper: Panel) => {
    await at(wrapper, 'plans-tab-cloud').trigger('click')
    await flushPromises()
  }

  const fillPasswordForm = async (wrapper: Panel, current: string, next: string, confirm = next) => {
    await at(wrapper, 'toggle-change-password').trigger('click')
    await at(wrapper, 'current-password').find('input').setValue(current)
    await at(wrapper, 'new-password').find('input').setValue(next)
    await at(wrapper, 'confirm-password').find('input').setValue(confirm)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
  }

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('names the signed-in user', () => {
    expect(render().text()).toContain('pioneer')
  })

  describe('change password', () => {
    it('sends the current and new password to the server', async () => {
      const wrapper = render()
      vi.mocked(authStore.changePassword).mockResolvedValue(true)

      await fillPasswordForm(wrapper, 'old-one', 'new-one')

      expect(authStore.changePassword).toHaveBeenCalledWith('old-one', 'new-one')
      expect(at(wrapper, 'password-success').text()).toContain('Password changed')
    })

    it('clears the fields once it worked, so nothing is left lying around', async () => {
      const wrapper = render()
      vi.mocked(authStore.changePassword).mockResolvedValue(true)

      await fillPasswordForm(wrapper, 'old-one', 'new-one')

      expect(at(wrapper, 'current-password').find('input').element.value).toBe('')
      expect(at(wrapper, 'new-password').find('input').element.value).toBe('')
    })

    it('refuses a mismatched confirmation without asking the server', async () => {
      const wrapper = render()

      await fillPasswordForm(wrapper, 'old-one', 'new-one', 'new-two')

      expect(authStore.changePassword).not.toHaveBeenCalled()
      expect(at(wrapper, 'password-error').text()).toContain('do not match')
    })

    it('refuses an empty field without asking the server', async () => {
      const wrapper = render()

      await fillPasswordForm(wrapper, '', 'new-one')

      expect(authStore.changePassword).not.toHaveBeenCalled()
      expect(at(wrapper, 'password-error').text()).toContain('Fill in both')
    })

    it('shows the server\'s own refusal', async () => {
      const wrapper = render()
      vi.mocked(authStore.changePassword).mockResolvedValue('Current password is incorrect.')

      await fillPasswordForm(wrapper, 'wrong', 'new-one')

      expect(at(wrapper, 'password-error').text()).toContain('Current password is incorrect.')
      expect(at(wrapper, 'password-success').exists()).toBe(false)
    })
  })

  describe('connection state', () => {
    // The icon is named as well as the label: every state has its own, and the one
    // this panel could not reach from its default state was the one that was wrong.
    it.each([
      [{ mode: 'online', connection: 'connected' }, 'Connected', 'fa-wifi'],
      [{ mode: 'reconnecting', connection: 'reconnecting' }, 'Reconnecting', 'fa-sync'],
      [{ mode: 'offlinePrompt', connection: 'reconnecting' }, 'You appear to be offline', 'fa-exclamation-triangle'],
      [{ mode: 'offline', connection: 'stopped' }, 'Offline mode', 'fa-plane'],
      [{ mode: 'online', connection: 'version_mismatch' }, 'Update required', 'fa-exclamation-triangle'],
      [{ mode: 'online', connection: 'stopped' }, 'Not connected', 'fa-ban'],
    ])('reads %o as "%s"', (state, label, icon) => {
      const wrapper = render({ roomSync: state })
      const chip = at(wrapper, 'connection-chip')

      expect(chip.text()).toContain(label)
      expect(chip.find(`i.${icon}`).exists()).toBe(true)
    })
  })

  describe('offline switch', () => {
    it('goes silent when switched on', async () => {
      const wrapper = render()

      await at(wrapper, 'offline-switch').find('input').setValue(true)

      expect(roomSync.enterOffline).toHaveBeenCalled()
    })

    it('comes back online when switched off', async () => {
      const wrapper = render({ roomSync: { mode: 'offline' } })

      await at(wrapper, 'offline-switch').find('input').setValue(false)

      expect(roomSync.exitOffline).toHaveBeenCalled()
    })
  })

  describe('the Local and Cloud tabs', () => {
    it('opens on Local and switches to Cloud and back', async () => {
      const wrapper = render()
      expect(at(wrapper, 'local-pane').exists()).toBe(true)
      expect(at(wrapper, 'cloud-pane').exists()).toBe(false)

      await openCloud(wrapper)
      expect(at(wrapper, 'local-pane').exists()).toBe(false)
      expect(at(wrapper, 'cloud-pane').exists()).toBe(true)

      await at(wrapper, 'plans-tab-local').trigger('click')
      expect(at(wrapper, 'local-pane').exists()).toBe(true)
    })
  })

  describe('local plans', () => {
    const mixedTabs = () => ({
      tabs: [tab('local-1', 'My Browser Plan'), tab('room-1', 'Iron Plates')],
      tabStates: {
        'room-1': { kind: 'synced', shared: false, role: 'owner', revision: 3 },
      } as TabSyncStateMap,
    })

    it('lists only the tabs that live in this browser', () => {
      const wrapper = render({}, mixedTabs())

      const rows = wrapper.findAll('[data-testid="local-plan"]')
      expect(rows).toHaveLength(1)
      expect(rows[0].text()).toContain('My Browser Plan')
      expect(rows[0].text()).not.toContain('Iron Plates')
    })

    it('says so plainly when every tab is already on the cloud', () => {
      const wrapper = render({}, {
        tabs: [tab('room-1', 'Iron Plates')],
        tabStates: { 'room-1': { kind: 'synced', shared: false, role: 'owner', revision: 3 } },
      })

      expect(at(wrapper, 'no-local-plans').exists()).toBe(true)
      expect(at(wrapper, 'local-plan').exists()).toBe(false)
    })

    it('opens the share dialog for the local tab that was clicked', async () => {
      const wrapper = render({}, mixedTabs())

      await at(wrapper, 'share-local-plan').trigger('click')

      const dialog = wrapper.findComponent(ShareDialog)
      expect(dialog.props('modelValue')).toBe(true)
      expect(dialog.props('tabId')).toBe('local-1')
    })

    it('converts a local tab through the adoption path', async () => {
      const wrapper = render({}, mixedTabs())

      await at(wrapper, 'convert-local-plan').trigger('click')
      await flushPromises()

      expect(roomsStore.adoptTabs).toHaveBeenCalledWith(['local-1'])
    })
  })

  describe('cloud plans', () => {
    it('splits the rooms into My Plans and Joined Plans by role', async () => {
      const wrapper = render({
        rooms: {
          entries: {
            'room-1': entry(),
            'room-2': entry({ roomId: 'room-2', name: 'Steel', role: 'member', order: 1 }),
          },
        },
      })
      await openCloud(wrapper)

      const mine = at(wrapper, 'my-plans')
      const joined = at(wrapper, 'joined-plans')
      expect(mine.findAll('[data-testid="my-plan"]')).toHaveLength(1)
      expect(mine.text()).toContain('Iron Plates')
      expect(mine.text()).not.toContain('Steel')
      expect(joined.findAll('[data-testid="joined-plan"]')).toHaveLength(1)
      expect(joined.text()).toContain('Steel')
    })

    it('says so plainly when the account owns no plans', async () => {
      const wrapper = render()
      await openCloud(wrapper)

      expect(at(wrapper, 'no-owned-plans').exists()).toBe(true)
    })

    it('keeps the Joined Plans group out of the way until a plan is joined', async () => {
      const wrapper = render({ rooms: { entries: { 'room-1': entry() } } })
      await openCloud(wrapper)

      expect(at(wrapper, 'joined-plans').exists()).toBe(false)
    })

    it('marks a shared plan', async () => {
      const wrapper = render({ rooms: { entries: { 'room-1': entry({ shared: true }) } } })
      await openCloud(wrapper)

      expect(at(wrapper, 'my-plan').text()).toContain('Shared')
    })

    it('opens the share dialog for the room that was clicked', async () => {
      const wrapper = render({ rooms: { entries: { 'room-1': entry() } } })
      await openCloud(wrapper)

      await at(wrapper, 'share-plan').trigger('click')

      const dialog = wrapper.findComponent(ShareDialog)
      expect(dialog.props('modelValue')).toBe(true)
      expect(dialog.props('tabId')).toBe('room-1')
    })
  })

  describe('recover server copy', () => {
    // Login pulls the account's tabs on its own now, so the manual control is gone.
    it('is gone from the panel', () => {
      const wrapper = render()

      expect(at(wrapper, 'recover-server-copy').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('Recover server copy')
    })
  })

  describe('last changed', () => {
    const minutesAgo = (minutes: number) =>
      new Date(Date.now() - minutes * 60_000).toISOString()

    it('shows how long ago each plan was changed', async () => {
      const wrapper = render({
        rooms: { entries: { 'room-1': entry({ lastActivityAt: minutesAgo(5) }) } },
      })
      await openCloud(wrapper)

      expect(at(wrapper, 'plan-last-changed').text()).toBe(relativeTime(minutesAgo(5)))
    })

    it('shows nothing rather than a broken date when the stamp is unreadable', async () => {
      const wrapper = render({
        rooms: { entries: { 'room-1': entry({ lastActivityAt: 'nonsense' }) } },
      })
      await openCloud(wrapper)

      expect(at(wrapper, 'plan-last-changed').text()).toBe('')
    })

    // Content edits never bump roomsRevision, so nothing else refetches the list and
    // a panel opened later in the session would show the times it was first given.
    it('refreshes the list when the tray opens', async () => {
      const wrapper = render({}, { open: false })
      expect(roomsStore.refresh).not.toHaveBeenCalled()

      await wrapper.setProps({ open: true })

      expect(roomsStore.refresh).toHaveBeenCalled()
    })
  })

  it('says what the per-plan share button opens, on hover', async () => {
    const wrapper = render({ rooms: { entries: { 'room-1': entry() } } })
    await openCloud(wrapper)

    await at(wrapper, 'share-plan').trigger('mouseenter')
    await flushPromises()

    expect(document.body.textContent).toContain('Sharing and invite links for this plan')
  })

  // The vendored Font Awesome is 5.15.4, where a v6 name draws the missing-icon
  // placeholder instead of failing, so the names are asserted rather than eyeballed.
  // Every connection state is rendered: a state the default render cannot reach is
  // exactly where the last one of these hid. The Cloud pane is opened so both panes'
  // icons are in the swept markup.
  it.each([
    { mode: 'online', connection: 'connected' },
    { mode: 'reconnecting', connection: 'reconnecting' },
    { mode: 'offlinePrompt', connection: 'reconnecting' },
    { mode: 'offline', connection: 'stopped' },
    { mode: 'online', connection: 'version_mismatch' },
  ])('draws %o with names the vendored Font Awesome 5 ships', async state => {
    const wrapper = render(
      { roomSync: state, rooms: { entries: { 'room-1': entry() } } },
      { tabs: [tab('local-1', 'Mine')] },
    )
    const localNames = wrapper.html().match(/fa-[a-z0-9-]+/g) ?? []
    await openCloud(wrapper)
    const names = [...localNames, ...(wrapper.html().match(/fa-[a-z0-9-]+/g) ?? [])]

    expect(names).toContain('fa-cloud-upload-alt')
    expect(names.length).toBeGreaterThan(0)
    for (const v6 of ['fa-cloud-arrow-down', 'fa-cloud-arrow-up', 'fa-triangle-exclamation', 'fa-plug-circle-xmark', 'fa-rotate']) {
      expect(names).not.toContain(v6)
    }
  })

  it('signs out of the rooms before the account, so no plan is orphaned', async () => {
    const wrapper = render()

    await wrapper.findAll('button').find(button => button.text().includes('Log out'))?.trigger('click')

    expect(roomsStore.signOut).toHaveBeenCalled()
    expect(authStore.logout).toHaveBeenCalled()
  })
})
