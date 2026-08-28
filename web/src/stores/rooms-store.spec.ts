import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { PROTOCOL_VERSION } from 'common'
import type { RoomListEntry } from 'common'
import * as api from '@/api/client'
import { ApiError } from '@/api/client'
import { useAppStore } from '@/stores/app-store'
import { useAuthStore } from '@/stores/auth-store'
import { useRoomSyncStore } from '@/stores/room-sync-store'
import { useRoomsStore } from '@/stores/rooms-store'
import { readTabMirrorMeta, setTabMirrorMeta } from '@/sync/tab-mirror-meta'
import { newFactory } from '@/utils/factory-management/factory'
import eventBus from '@/utils/eventBus'

vi.mock('@/api/client', async importOriginal => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return {
    ...actual,
    listRooms: vi.fn(),
    createRoom: vi.fn(),
    adoptRoom: vi.fn(),
    renameRoom: vi.fn(),
    deleteRoom: vi.fn(),
    leaveRoom: vi.fn(),
    legacyAutoImport: vi.fn(),
  }
})

const entry = (overrides: Partial<RoomListEntry> = {}): RoomListEntry => ({
  roomId: 'room-1',
  name: 'Plan',
  slug: null,
  shared: false,
  hasPassword: false,
  revision: 3,
  role: 'owner',
  order: 0,
  ...overrides,
})

const taken = (): ApiError => new ApiError(409, 'taken', { code: 'room_id_taken' })

describe('rooms-store', () => {
  let appStore: ReturnType<typeof useAppStore>
  let roomSync: ReturnType<typeof useRoomSyncStore>
  let store: ReturnType<typeof useRoomsStore>

  const listReturns = (rooms: RoomListEntry[], roomsRevision = 1) => {
    vi.mocked(api.listRooms).mockResolvedValue({ roomsRevision, rooms })
  }

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    setActivePinia(createPinia())

    appStore = useAppStore()
    appStore.isLoaded = true
    roomSync = useRoomSyncStore()
    store = useRoomsStore()

    const authStore = useAuthStore()
    authStore.setToken('token')
    authStore.setLoggedInUser('pioneer')

    listReturns([])
  })

  afterEach(() => {
    store.dispose()
    roomSync.dispose()
  })

  /** The tab the store boots with, renamed so collisions are deliberate. */
  const localTab = (name: string, factoryCount = 1) => {
    const tab = appStore.getCurrentTab()
    tab.name = name
    tab.factories.splice(0, tab.factories.length)
    for (let index = 0; index < factoryCount; index++) {
      tab.factories.push(newFactory(`${name} ${index}`))
    }
    return tab
  }

  describe('the room list drives the tab state', () => {
    it('marks a tab synced when the list carries its id', async () => {
      const tab = localTab('Plan')
      listReturns([entry({ roomId: tab.id, revision: 9 })])

      await store.refresh()

      expect(appStore.getTabState(tab.id)).toEqual({
        kind: 'synced',
        shared: false,
        role: 'owner',
        revision: 9,
      })
    })

    it('distinguishes a collaborative room by its shared flag', async () => {
      const tab = localTab('Plan')
      listReturns([entry({ roomId: tab.id, shared: true, role: 'member' })])

      await store.refresh()

      expect(appStore.getTabState(tab.id).shared).toBe(true)
      expect(appStore.getTabState(tab.id).role).toBe('member')
    })

    it('brings in a room made on another device without stealing focus', async () => {
      localTab('Plan')
      const before = appStore.currentFactoryTabIndex
      listReturns([entry({ roomId: 'remote-room', name: 'Made elsewhere' })])

      await store.refresh()

      expect(appStore.getTab('remote-room')?.name).toBe('Made elsewhere')
      expect(appStore.currentFactoryTabIndex).toBe(before)
      expect(appStore.getTabState('remote-room').kind).toBe('synced')
    })

    it('sweeps sidecar metadata for tabs the bar no longer holds', async () => {
      const tab = localTab('Plan')
      setTabMirrorMeta('long-gone', {
        revision: 2,
        appVersion: PROTOCOL_VERSION,
        userTouchedIds: [],
        userTouchedFields: [],
      })
      listReturns([entry({ roomId: tab.id })])

      await store.refresh()

      expect(readTabMirrorMeta()['long-gone']).toBeUndefined()
    })

    it('does nothing at all when signed out', async () => {
      useAuthStore().logout()

      expect(await store.refresh()).toBe(false)
      expect(api.listRooms).not.toHaveBeenCalled()
    })

    it('stays quiet while offline mode is on', async () => {
      roomSync.enterOffline()

      expect(await store.refresh()).toBe(false)
      expect(api.listRooms).not.toHaveBeenCalled()
    })
  })

  describe('revocation', () => {
    it('converts a synced tab the list no longer carries into a local copy', async () => {
      const tab = localTab('Shared with me')
      listReturns([entry({ roomId: tab.id, shared: true })])
      await store.refresh()
      const emit = vi.spyOn(eventBus, 'emit')

      listReturns([])
      await store.refresh()

      expect(appStore.getTabState(tab.id).kind).toBe('local')
      expect(appStore.getTab(tab.id)?.factories).toHaveLength(1)
      expect(emit).toHaveBeenCalledWith('toast', expect.objectContaining({ type: 'warning' }))
    })

    it('converts a deleted room into a local copy', async () => {
      const tab = localTab('Doomed')
      listReturns([entry({ roomId: tab.id })])
      await store.refresh()

      roomSync.handleMessage({ type: 'room_deleted', roomId: tab.id })
      store.reconcileRooms()

      expect(appStore.getTabState(tab.id).kind).toBe('local')
      expect(appStore.getTab(tab.id)?.factories).toHaveLength(1)
      expect(roomSync.rooms[tab.id]).toBeUndefined()
    })

    it('reacts to a room going away without being asked', async () => {
      const tab = localTab('Doomed')
      listReturns([entry({ roomId: tab.id })])
      await store.refresh()

      roomSync.handleMessage({ type: 'room_deleted', roomId: tab.id })
      await nextTick()

      expect(appStore.getTabState(tab.id).kind).toBe('local')
    })

    it('flips a tab to collaborative the moment room_meta says it is shared', async () => {
      const tab = localTab('Plan')
      listReturns([entry({ roomId: tab.id, shared: false })])
      await store.refresh()

      roomSync.handleMessage({
        type: 'room_meta',
        roomId: tab.id,
        meta: { name: 'Plan', slug: 'three-word-slug', shared: true, hasPassword: false },
      })
      await nextTick()

      expect(appStore.getTabState(tab.id).shared).toBe(true)
    })

    it('mirrors the engine revision into the tab state', async () => {
      const tab = localTab('Plan')
      listReturns([entry({ roomId: tab.id, revision: 3 })])
      await store.refresh()

      roomSync.rooms[tab.id].status = 'synced'
      roomSync.rooms[tab.id].revision = 11
      store.reconcileRooms()

      expect(appStore.getTabState(tab.id).revision).toBe(11)
    })
  })

  describe('adoption', () => {
    it('offers every local tab the server does not know', async () => {
      const tab = localTab('Mine')
      listReturns([entry({ roomId: 'other-room' })])

      await store.refresh({ offerAdoption: true })

      expect(store.adoptionOpen).toBe(true)
      expect(store.adoptionCandidates).toEqual([tab.id])
    })

    it('never offers an empty tab', async () => {
      localTab('Empty', 0)

      await store.refresh({ offerAdoption: true })

      expect(store.adoptionOpen).toBe(false)
    })

    it('leaves declined tabs local', async () => {
      const tab = localTab('Mine')
      await store.refresh({ offerAdoption: true })

      store.declineAdoption()

      expect(store.adoptionOpen).toBe(false)
      expect(appStore.getTabState(tab.id).kind).toBe('local')
      expect(api.adoptRoom).not.toHaveBeenCalled()
    })

    it('adopts create-only, carrying the tab id and its content', async () => {
      const tab = localTab('Mine')
      tab.powerTarget = 250
      vi.mocked(api.adoptRoom).mockResolvedValue({
        status: 'created',
        room: entry({ roomId: tab.id, name: 'Mine' }),
      })
      // The refresh adoption ends with sees the new room, as the real API would.
      listReturns([entry({ roomId: tab.id, name: 'Mine' })])

      await store.adoptTabs([tab.id])

      expect(api.adoptRoom).toHaveBeenCalledWith(expect.objectContaining({
        roomId: tab.id,
        name: 'Mine',
        powerTarget: 250,
      }))
      expect(appStore.getTabState(tab.id).kind).toBe('synced')
    })

    it('suffixes a name the account already uses', async () => {
      const tab = localTab('Plan')
      listReturns([entry({ roomId: 'other-room', name: 'Plan' })])
      await store.refresh()
      vi.mocked(api.adoptRoom).mockResolvedValue({
        status: 'created',
        room: entry({ roomId: tab.id, name: 'Plan (local)' }),
      })
      listReturns([
        entry({ roomId: 'other-room', name: 'Plan' }),
        entry({ roomId: tab.id, name: 'Plan (local)' }),
      ])

      await store.adoptTabs([tab.id])

      expect(api.adoptRoom).toHaveBeenCalledWith(expect.objectContaining({ name: 'Plan (local)' }))
      expect(appStore.getTab(tab.id)?.name).toBe('Plan (local)')
    })

    it('re-keys the tab and retries once when the id belongs to someone else', async () => {
      const tab = localTab('Mine')
      const originalId = tab.id
      vi.mocked(api.adoptRoom)
        .mockRejectedValueOnce(taken())
        .mockResolvedValueOnce({ status: 'created', room: entry({ roomId: 'whatever', name: 'Mine' }) })

      await store.adoptTabs([originalId])

      expect(api.adoptRoom).toHaveBeenCalledTimes(2)
      const [, second] = vi.mocked(api.adoptRoom).mock.calls
      expect(second[0].roomId).not.toBe(originalId)
      expect(appStore.getTab(originalId)).toBeUndefined()
      expect(appStore.getTabs()[0].factories).toHaveLength(1)
    })

    it('gives up after one re-key rather than looping', async () => {
      const tab = localTab('Mine')
      vi.mocked(api.adoptRoom).mockRejectedValue(taken())

      await store.adoptTabs([tab.id])

      expect(api.adoptRoom).toHaveBeenCalledTimes(2)
      expect(appStore.getTabs()[0].factories).toHaveLength(1)
    })

    it('auto-imports the legacy blob only for an empty account in an empty browser', async () => {
      localTab('Empty', 0)
      vi.mocked(api.legacyAutoImport).mockResolvedValue({ imported: false, reason: 'no_legacy_data' })

      await store.refresh({ offerAdoption: true })

      expect(api.legacyAutoImport).toHaveBeenCalledWith(0)
    })

    it('does not auto-import when the account already has a room', async () => {
      localTab('Empty', 0)
      listReturns([entry({ roomId: 'other-room' })])

      await store.refresh({ offerAdoption: true })

      expect(api.legacyAutoImport).not.toHaveBeenCalled()
    })

    it('does not auto-import when the browser holds a plan', async () => {
      localTab('Mine')

      await store.refresh({ offerAdoption: true })

      expect(api.legacyAutoImport).not.toHaveBeenCalled()
      expect(store.adoptionOpen).toBe(true)
    })
  })

  describe('rename', () => {
    it('renames a local tab without touching the server', async () => {
      const tab = localTab('Old')

      expect(await store.renameTab(tab.id, 'New')).toBe(true)

      expect(appStore.getTab(tab.id)?.name).toBe('New')
      expect(api.renameRoom).not.toHaveBeenCalled()
    })

    it('renames a synced tab through the server so it propagates', async () => {
      const tab = localTab('Old')
      listReturns([entry({ roomId: tab.id })])
      await store.refresh()
      vi.mocked(api.renameRoom).mockResolvedValue({ room: entry({ roomId: tab.id, name: 'New' }) })

      expect(await store.renameTab(tab.id, 'New')).toBe(true)

      expect(api.renameRoom).toHaveBeenCalledWith(tab.id, 'New')
      expect(appStore.getTab(tab.id)?.name).toBe('New')
    })

    it('puts the old name back when the server refuses', async () => {
      const tab = localTab('Old')
      listReturns([entry({ roomId: tab.id })])
      await store.refresh()
      vi.mocked(api.renameRoom).mockRejectedValue(new ApiError(403, 'Only the owner'))

      expect(await store.renameTab(tab.id, 'New')).toBe('Only the owner')

      expect(appStore.getTab(tab.id)?.name).toBe('Old')
    })

    it('refuses a member rename before it reaches the server', async () => {
      const tab = localTab('Old')
      listReturns([entry({ roomId: tab.id, role: 'member', shared: true })])
      await store.refresh()

      expect(await store.renameTab(tab.id, 'New')).toBe('Only the owner can rename this plan.')

      expect(store.canRename(tab.id)).toBe(false)
      expect(api.renameRoom).not.toHaveBeenCalled()
      expect(appStore.getTab(tab.id)?.name).toBe('Old')
    })
  })

  describe('removing a tab', () => {
    it('deletes the room when the user owns it', async () => {
      const tab = localTab('Mine')
      listReturns([entry({ roomId: tab.id, role: 'owner' })])
      await store.refresh()
      vi.mocked(api.deleteRoom).mockResolvedValue({ status: 'deleted' })

      expect(await store.removeTab(tab.id)).toBe(true)

      expect(api.deleteRoom).toHaveBeenCalledWith(tab.id)
      expect(appStore.getTabState(tab.id).kind).toBe('local')
    })

    it('only leaves the room when the user is a member', async () => {
      const tab = localTab('Theirs')
      listReturns([entry({ roomId: tab.id, role: 'member', shared: true })])
      await store.refresh()
      vi.mocked(api.leaveRoom).mockResolvedValue({ status: 'left' })

      expect(await store.removeTab(tab.id)).toBe(true)

      expect(api.leaveRoom).toHaveBeenCalledWith(tab.id)
      expect(api.deleteRoom).not.toHaveBeenCalled()
    })

    it('treats an already-gone room as done', async () => {
      const tab = localTab('Mine')
      listReturns([entry({ roomId: tab.id })])
      await store.refresh()
      vi.mocked(api.deleteRoom).mockRejectedValue(new ApiError(404, 'gone'))

      expect(await store.removeTab(tab.id)).toBe(true)
    })

    it('keeps the tab when the server refuses', async () => {
      const tab = localTab('Mine')
      listReturns([entry({ roomId: tab.id })])
      await store.refresh()
      vi.mocked(api.deleteRoom).mockRejectedValue(new ApiError(500, 'nope'))

      expect(await store.removeTab(tab.id)).toBe('nope')

      expect(appStore.getTabState(tab.id).kind).toBe('synced')
    })
  })

  describe('creating a synced tab', () => {
    it('needs an account', async () => {
      useAuthStore().logout()

      expect(await store.createSyncedTab()).toBe('Sign in first to create a synced tab.')
      expect(api.createRoom).not.toHaveBeenCalled()
    })

    it('creates the room before the tab so a failure leaves nothing behind', async () => {
      const before = appStore.getTabs().length
      vi.mocked(api.createRoom).mockRejectedValue(new ApiError(400, 'too many rooms'))

      expect(await store.createSyncedTab('Nope')).toBe('too many rooms')

      expect(appStore.getTabs()).toHaveLength(before)
    })

    it('adds a synced tab once the room exists', async () => {
      vi.mocked(api.createRoom).mockImplementation(async body => ({
        status: 'created',
        room: entry({ roomId: body.roomId as string, name: body.name, revision: 0 }),
      }))

      expect(await store.createSyncedTab('Fresh')).toBe(true)

      const created = appStore.getCurrentTab()
      expect(created.name).toBe('Fresh')
      expect(appStore.getTabState(created.id).kind).toBe('synced')
    })
  })

  describe('signing out', () => {
    it('keeps every plan and stops them being rooms', async () => {
      const tab = localTab('Mine')
      listReturns([entry({ roomId: tab.id })])
      await store.refresh()

      store.signOut()

      expect(appStore.getTabState(tab.id).kind).toBe('local')
      expect(appStore.getTab(tab.id)?.factories).toHaveLength(1)
      expect(store.entries).toEqual({})
    })
  })
})
