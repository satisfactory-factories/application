import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { RoomListEntry, RoomRole } from 'common'
import TabSettingsDialog from './TabSettingsDialog.vue'
import vuetify from '@/plugins/vuetify'
import * as api from '@/api/client'
import { useAppStore } from '@/stores/app-store'
import { useAuthStore } from '@/stores/auth-store'
import { useRoomSyncStore } from '@/stores/room-sync-store'
import { useRoomsStore } from '@/stores/rooms-store'
import { newFactory } from '@/utils/factory-management/factory'

vi.mock('@/api/client', async importOriginal => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return {
    ...actual,
    listRooms: vi.fn(),
    adoptRoom: vi.fn(),
    renameRoom: vi.fn(),
    deleteRoom: vi.fn(),
    leaveRoom: vi.fn(),
  }
})

// The dialog teleports its content to the body, so everything is read from there.
const body = () => document.body
const at = (testId: string) => body().querySelector<HTMLElement>(`[data-testid="${testId}"]`)
const shown = (testId: string) => at(testId) !== null

const nameInput = () => body().querySelector<HTMLInputElement>('[data-testid="tab-name-field"] input')

const entry = (overrides: Partial<RoomListEntry> = {}): RoomListEntry => ({
  roomId: 'room-1',
  name: 'Plan',
  slug: null,
  shared: false,
  hasPassword: false,
  revision: 3,
  role: 'owner',
  order: 0,
  lastActivityAt: '2026-08-31T11:00:00.000Z',
  factoryCount: 1,
  ...overrides,
})

describe('TabSettingsDialog', () => {
  let pinia: ReturnType<typeof createPinia>
  let appStore: ReturnType<typeof useAppStore>
  let authStore: ReturnType<typeof useAuthStore>
  let roomSync: ReturnType<typeof useRoomSyncStore>
  let roomsStore: ReturnType<typeof useRoomsStore>

  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    vi.clearAllMocks()
    pinia = createPinia()
    setActivePinia(pinia)

    appStore = useAppStore()
    appStore.isLoaded = true
    roomSync = useRoomSyncStore()
    roomsStore = useRoomsStore()

    authStore = useAuthStore()
    authStore.setToken('token')
    authStore.setLoggedInUser('pioneer')

    vi.mocked(api.listRooms).mockResolvedValue({ roomsRevision: 1, rooms: [] })
  })

  afterEach(() => {
    roomsStore.dispose()
    roomSync.dispose()
  })

  /** The boot tab, given a name and one factory so content survival is checkable. */
  const localTab = (): string => {
    const tab = appStore.getCurrentTab()
    tab.name = 'My plan'
    tab.factories.push(newFactory('Iron'))
    return tab.id
  }

  const syncedTab = ({ role = 'owner', shared = false }: { role?: RoomRole, shared?: boolean } = {}): string => {
    const tabId = localTab()
    appStore.setTabState(tabId, { kind: 'synced', shared, role, revision: 3 })
    roomsStore.entries[tabId] = entry({ roomId: tabId, name: 'My plan', shared, role })
    return tabId
  }

  const joinedTab = (): string => {
    const tabId = localTab()
    appStore.setTabState(tabId, { kind: 'joined', shared: true, role: 'member', revision: null })
    return tabId
  }

  const render = async (tabId: string) => {
    const wrapper = mount(TabSettingsDialog, {
      global: { plugins: [vuetify, pinia] },
      props: { tabId, modelValue: true },
      attachTo: document.body,
    })
    await flushPromises()
    return wrapper
  }

  const typeName = async (value: string) => {
    const input = nameInput()!
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
  }

  describe('what each tab kind is offered', () => {
    it('offers a local tab the cloud and share settings, and nothing destructive', async () => {
      await render(localTab())

      expect(shown('convert-to-cloud')).toBe(true)
      expect(shown('convert-to-local')).toBe(false)
      expect(shown('share-settings')).toBe(true)
      expect(shown('rename-refusal')).toBe(false)
    })

    it('offers a private cloud plan its owner share settings and the way back to local', async () => {
      await render(syncedTab())

      expect(shown('convert-to-local')).toBe(true)
      expect(shown('convert-to-cloud')).toBe(false)
      expect(shown('share-settings')).toBe(true)
      expect(shown('rename-refusal')).toBe(false)
    })

    it('keeps share settings once the plan is shared', async () => {
      await render(syncedTab({ shared: true }))

      expect(shown('share-settings')).toBe(true)
      expect(shown('convert-to-local')).toBe(true)
      expect(shown('convert-to-cloud')).toBe(false)
    })

    it('gives a member leave-and-keep and share settings, and no rename', async () => {
      await render(syncedTab({ role: 'member', shared: true }))

      expect(shown('convert-to-local')).toBe(true)
      expect(shown('share-settings')).toBe(true)
      expect(shown('convert-to-cloud')).toBe(false)
      expect(shown('rename-refusal')).toBe(true)
      expect(nameInput()?.disabled).toBe(true)
      expect(at('tab-name-apply')?.hasAttribute('disabled')).toBe(true)
    })

    it('treats an anonymous visitor tab like a membership without the account', async () => {
      await render(joinedTab())

      expect(shown('convert-to-local')).toBe(true)
      expect(shown('share-settings')).toBe(true)
      expect(shown('convert-to-cloud')).toBe(false)
    })
  })

  describe('renaming', () => {
    it('applies the name through the Apply button', async () => {
      const tabId = localTab()
      await render(tabId)

      await typeName('Renamed by button')
      at('tab-name-apply')!.click()
      await flushPromises()

      expect(appStore.getTab(tabId)?.name).toBe('Renamed by button')
    })

    it('applies the name on Enter', async () => {
      const tabId = localTab()
      await render(tabId)

      await typeName('Renamed by enter')
      nameInput()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await flushPromises()

      expect(appStore.getTab(tabId)?.name).toBe('Renamed by enter')
    })

    it('applies the name on blur', async () => {
      const tabId = localTab()
      await render(tabId)

      await typeName('Renamed by blur')
      nameInput()!.dispatchEvent(new Event('blur'))
      await flushPromises()

      expect(appStore.getTab(tabId)?.name).toBe('Renamed by blur')
    })

    it('sends an owner\'s rename through the existing server path', async () => {
      const tabId = syncedTab()
      vi.mocked(api.renameRoom).mockResolvedValue({
        room: entry({ roomId: tabId, name: 'Fresh name' }),
      })
      await render(tabId)

      await typeName('Fresh name')
      at('tab-name-apply')!.click()
      await flushPromises()

      expect(api.renameRoom).toHaveBeenCalledWith(tabId, 'Fresh name')
      expect(appStore.getTab(tabId)?.name).toBe('Fresh name')
    })

    it('says why a rename was refused rather than losing it silently', async () => {
      const tabId = localTab()
      await render(tabId)

      await typeName('   ')
      at('tab-name-apply')!.click()
      await flushPromises()

      expect(at('rename-error')?.textContent).toContain('A tab needs a name.')
      expect(appStore.getTab(tabId)?.name).toBe('My plan')
    })
  })

  describe('convert to cloud', () => {
    it('goes through the adoption path for exactly this tab', async () => {
      const tabId = localTab()
      vi.mocked(api.adoptRoom).mockResolvedValue({
        status: 'created',
        room: entry({ roomId: tabId, name: 'My plan' }),
      })
      // Adoption refreshes the list, and a synced tab the list omits is revoked.
      vi.mocked(api.listRooms).mockResolvedValue({
        roomsRevision: 2,
        rooms: [entry({ roomId: tabId, name: 'My plan' })],
      })
      await render(tabId)

      at('convert-to-cloud')!.click()
      await flushPromises()

      expect(api.adoptRoom).toHaveBeenCalledWith(expect.objectContaining({
        roomId: tabId,
        name: 'My plan',
      }))
      expect(appStore.getTabState(tabId).kind).toBe('synced')
      expect(appStore.getTab(tabId)?.factories).toHaveLength(1)
    })

    it('is disabled signed out, and the tooltip says what to do about it', async () => {
      authStore.setToken('')
      authStore.setLoggedInUser('')
      const tabId = localTab()
      await render(tabId)

      const button = at('convert-to-cloud')!
      expect(button.hasAttribute('disabled')).toBe(true)

      button.closest('span')!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
      await flushPromises()

      expect(body().textContent).toContain(
        'You need to have an account for this, please register using the Sign in Pioneer button top right of the planner'
      )
      expect(api.adoptRoom).not.toHaveBeenCalled()
    })
  })

  describe('convert to local', () => {
    it('fires no server call until the owner confirms', async () => {
      const tabId = syncedTab({ shared: true })
      await render(tabId)

      at('convert-to-local')!.click()
      await flushPromises()

      expect(api.deleteRoom).not.toHaveBeenCalled()
      expect(at('convert-to-local-warning')?.textContent)
        .toContain('Everyone you shared it with keeps their copy as a local tab')
      expect(shown('confirm-convert-to-local')).toBe(true)
    })

    it('backs out of the confirm without touching the server', async () => {
      const tabId = syncedTab()
      await render(tabId)

      at('convert-to-local')!.click()
      await flushPromises()
      at('cancel-convert-to-local')!.click()
      await flushPromises()

      expect(api.deleteRoom).not.toHaveBeenCalled()
      expect(shown('convert-to-local-warning')).toBe(false)
      expect(appStore.getTabState(tabId).kind).toBe('synced')
    })

    it('deletes the room and keeps the plan as a local tab once confirmed', async () => {
      const tabId = syncedTab()
      vi.mocked(api.deleteRoom).mockResolvedValue({ status: 'deleted' })
      await render(tabId)

      at('convert-to-local')!.click()
      await flushPromises()
      at('confirm-convert-to-local')!.click()
      await flushPromises()

      expect(api.deleteRoom).toHaveBeenCalledWith(tabId)
      expect(appStore.getTab(tabId)?.factories).toHaveLength(1)
      expect(appStore.getTabState(tabId).kind).toBe('local')
    })

    it('has a member leave rather than delete, keeping their copy', async () => {
      const tabId = syncedTab({ role: 'member', shared: true })
      vi.mocked(api.leaveRoom).mockResolvedValue({ status: 'left' })
      await render(tabId)

      at('convert-to-local')!.click()
      await flushPromises()

      expect(api.leaveRoom).toHaveBeenCalledWith(tabId)
      expect(api.deleteRoom).not.toHaveBeenCalled()
      expect(appStore.getTab(tabId)?.factories).toHaveLength(1)
      expect(appStore.getTabState(tabId).kind).toBe('local')
    })

    it('unhooks an anonymous visitor with no server call at all', async () => {
      const tabId = joinedTab()
      await render(tabId)

      at('convert-to-local')!.click()
      await flushPromises()

      expect(api.leaveRoom).not.toHaveBeenCalled()
      expect(api.deleteRoom).not.toHaveBeenCalled()
      expect(appStore.getTabState(tabId).kind).toBe('local')
      expect(appStore.getTab(tabId)?.factories).toHaveLength(1)
    })
  })

  describe('share settings', () => {
    it('opens the existing share dialog from Share Settings', async () => {
      const tabId = syncedTab({ shared: true })
      await render(tabId)

      expect(shown('share-dialog')).toBe(false)
      at('share-settings')!.click()
      await flushPromises()

      expect(shown('share-dialog')).toBe(true)
    })

    it('opens it for a local tab too, on the snapshot-only pane', async () => {
      await render(localTab())

      at('share-settings')!.click()
      await flushPromises()

      expect(shown('share-dialog')).toBe(true)
      expect(shown('create-snapshot')).toBe(true)
      expect(at('invite-blocked')?.textContent).toContain(
        'You must convert this tab to a cloud tab before it is possible to share it'
      )
    })

    it('keeps the button after a conversion, on the cloud capabilities', async () => {
      const tabId = localTab()
      vi.mocked(api.adoptRoom).mockResolvedValue({
        status: 'created',
        room: entry({ roomId: tabId, name: 'My plan' }),
      })
      vi.mocked(api.listRooms).mockResolvedValue({
        roomsRevision: 2,
        rooms: [entry({ roomId: tabId, name: 'My plan' })],
      })
      await render(tabId)

      at('convert-to-cloud')!.click()
      await flushPromises()

      expect(appStore.getTabState(tabId).kind).toBe('synced')
      expect(shown('share-settings')).toBe(true)

      at('share-settings')!.click()
      await flushPromises()

      expect(shown('create-invite')).toBe(true)
      expect(shown('invite-blocked')).toBe(false)
    })
  })
})
