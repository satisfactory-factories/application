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
import { OFFLINE_MESSAGE, useRoomsStore } from '@/stores/rooms-store'
import { readTabMirrorMeta, setTabMirrorMeta } from '@/sync/tab-mirror-meta'
import { readVisitorToken, setVisitorToken } from '@/sync/visitor-tokens'
import { newFactory } from '@/utils/factory-management/factory'
import eventBus from '@/utils/eventBus'

vi.mock('@/api/client', async importOriginal => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return {
    ...actual,
    listRooms: vi.fn(),
    createRoom: vi.fn(),
    shareRoom: vi.fn(),
    unshareRoom: vi.fn(),
    setRoomPassword: vi.fn(),
    removeRoomPassword: vi.fn(),
    joinRoom: vi.fn(),
    adoptRoom: vi.fn(),
    renameRoom: vi.fn(),
    deleteRoom: vi.fn(),
    leaveRoom: vi.fn(),
    reorderRooms: vi.fn(),
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
  lastActivityAt: '2026-08-31T11:00:00.000Z',
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

    it('makes the reader dismiss a deletion somebody else performed', async () => {
      const tab = localTab('Doomed')
      listReturns([entry({ roomId: tab.id })])
      await store.refresh()
      const emit = vi.spyOn(eventBus, 'emit')

      roomSync.handleMessage({ type: 'room_deleted', roomId: tab.id })
      store.reconcileRooms()

      expect(emit).toHaveBeenCalledWith('toast', expect.objectContaining({
        variant: 'permanent',
        message: expect.stringContaining('was deleted by its owner'),
      }))
    })

    it('says nothing about a deletion this browser asked for', async () => {
      const tab = localTab('Mine to delete')
      listReturns([entry({ roomId: tab.id })])
      await store.refresh()
      vi.mocked(api.deleteRoom).mockResolvedValue({ status: 'deleted' })
      const emit = vi.spyOn(eventBus, 'emit')

      // The room's own fan-out reaches this client's socket while the request is open.
      const removal = store.removeTab(tab.id)
      roomSync.handleMessage({ type: 'room_deleted', roomId: tab.id })
      store.reconcileRooms()
      expect(await removal).toBe(true)

      expect(emit).not.toHaveBeenCalledWith('toast', expect.anything())
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

    // The account tray refreshes the list when it opens, and it opens on the same
    // login that asks for the offer. Turning the second caller away lost the offer.
    it('still offers when a plain refresh is already in flight', async () => {
      const tab = localTab('Mine')
      listReturns([entry({ roomId: 'other-room' })])

      const [, offered] = await Promise.all([
        store.refresh(),
        store.refresh({ offerAdoption: true }),
      ])

      expect(offered).toBe(true)
      expect(api.listRooms).toHaveBeenCalledTimes(1)
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

  describe('tab order', () => {
    /** A bar of "local, synced A, synced B", which is the interesting shape. */
    const mixedBar = async () => {
      const local = localTab('Local')
      appStore.addTab({ id: 'room-a', name: 'A', factories: [] }, { activate: false })
      appStore.addTab({ id: 'room-b', name: 'B', factories: [] }, { activate: false })
      listReturns([
        entry({ roomId: 'room-a', name: 'A', order: 0 }),
        entry({ roomId: 'room-b', name: 'B', order: 1 }),
      ])
      await store.refresh()
      return local.id
    }

    const barIds = () => appStore.getTabs().map(tab => tab.id)

    it('pushes only the synced tabs, in the sequence they are shown', async () => {
      const localId = await mixedBar()
      vi.mocked(api.reorderRooms).mockResolvedValue({
        roomsRevision: 2,
        rooms: [entry({ roomId: 'room-b', name: 'B', order: 0 }), entry({ roomId: 'room-a', name: 'A', order: 1 })],
      })

      expect(await store.reorderTabs([localId, 'room-b', 'room-a'])).toBe(true)

      expect(api.reorderRooms).toHaveBeenCalledWith(['room-b', 'room-a'])
      expect(barIds()).toEqual([localId, 'room-b', 'room-a'])
      expect(store.roomsRevision).toBe(2)
    })

    it('leaves a local tab where the drag put it, whatever the server says', async () => {
      const localId = await mixedBar()
      vi.mocked(api.reorderRooms).mockResolvedValue({
        roomsRevision: 2,
        rooms: [entry({ roomId: 'room-b', name: 'B', order: 0 }), entry({ roomId: 'room-a', name: 'A', order: 1 })],
      })

      await store.reorderTabs(['room-b', localId, 'room-a'])

      // The response is re-applied through the same interleave, so the local tab
      // must come back out of it in the slot the drag gave it.
      expect(barIds()).toEqual(['room-b', localId, 'room-a'])
    })

    it('says nothing to the server when the drag moved only local tabs', async () => {
      const localId = await mixedBar()

      expect(await store.reorderTabs(['room-a', localId, 'room-b'])).toBe(true)

      expect(api.reorderRooms).not.toHaveBeenCalled()
      expect(barIds()).toEqual(['room-a', localId, 'room-b'])
    })

    it('refuses an order that is not the bar it can see', async () => {
      await mixedBar()
      const before = barIds()

      expect(await store.reorderTabs(['room-b', 'room-a'])).toBe('That order does not match the tabs on screen.')

      expect(api.reorderRooms).not.toHaveBeenCalled()
      expect(barIds()).toEqual(before)
    })

    it('puts the bar back when the push fails', async () => {
      const localId = await mixedBar()
      const before = barIds()
      vi.mocked(api.reorderRooms).mockRejectedValue(new ApiError(404, 'No such room'))

      expect(await store.reorderTabs([localId, 'room-b', 'room-a'])).toBe('No such room')

      expect(barIds()).toEqual(before)
    })

    it('takes the order another device set, without moving a local tab', async () => {
      const localId = await mixedBar()

      listReturns([
        entry({ roomId: 'room-b', name: 'B', order: 0 }),
        entry({ roomId: 'room-a', name: 'A', order: 1 }),
      ], 3)
      await store.refresh()

      expect(barIds()).toEqual([localId, 'room-b', 'room-a'])
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

  describe('sharing controls', () => {
    it('records the room as shared once the server says so', async () => {
      const tab = localTab('Plan')
      listReturns([entry({ roomId: tab.id })])
      await store.refresh()
      vi.mocked(api.shareRoom).mockResolvedValue({
        room: entry({ roomId: tab.id, shared: true, slug: 'a-b-c' }),
      })

      expect(await store.shareTab(tab.id)).toBe(true)

      expect(store.entries[tab.id].slug).toBe('a-b-c')
      expect(appStore.getTabState(tab.id).shared).toBe(true)
    })

    it('passes a custom slug straight through', async () => {
      const tab = localTab('Plan')
      vi.mocked(api.shareRoom).mockResolvedValue({ room: entry({ roomId: tab.id, shared: true, slug: 'mine' }) })

      await store.shareTab(tab.id, 'mine')

      expect(api.shareRoom).toHaveBeenCalledWith(tab.id, 'mine')
    })

    it('returns what the server refused with, rather than throwing', async () => {
      const tab = localTab('Plan')
      vi.mocked(api.shareRoom).mockRejectedValue(new ApiError(409, 'That invite link is already taken.'))

      expect(await store.shareTab(tab.id, 'taken')).toBe('That invite link is already taken.')
    })

    it('drops the shared flag on unshare', async () => {
      const tab = localTab('Plan')
      listReturns([entry({ roomId: tab.id, shared: true, slug: 'a-b-c' })])
      await store.refresh()
      vi.mocked(api.unshareRoom).mockResolvedValue({ room: entry({ roomId: tab.id, shared: false, slug: null }) })

      expect(await store.unshareTab(tab.id)).toBe(true)

      expect(appStore.getTabState(tab.id).shared).toBe(false)
    })

    it('marks the room password-protected without refetching the list', async () => {
      const tab = localTab('Plan')
      listReturns([entry({ roomId: tab.id, shared: true })])
      await store.refresh()
      vi.mocked(api.listRooms).mockClear()
      vi.mocked(api.setRoomPassword).mockResolvedValue({ passwordVersion: 1 })

      expect(await store.setTabPassword(tab.id, 'hunter2')).toBe(true)

      expect(store.entries[tab.id].hasPassword).toBe(true)
      expect(api.listRooms).not.toHaveBeenCalled()
    })

    it('clears the flag again when the password is removed', async () => {
      const tab = localTab('Plan')
      listReturns([entry({ roomId: tab.id, shared: true, hasPassword: true })])
      await store.refresh()
      vi.mocked(api.removeRoomPassword).mockResolvedValue({ passwordVersion: 2 })

      expect(await store.removeTabPassword(tab.id)).toBe(true)

      expect(store.entries[tab.id].hasPassword).toBe(false)
    })
  })

  describe('joining someone else\'s room', () => {
    it('adds the room as a synced tab and brings it to the front', async () => {
      localTab('Mine')
      vi.mocked(api.joinRoom).mockResolvedValue({
        status: 'joined',
        room: entry({ roomId: 'their-room', name: 'Their plan', shared: true, role: 'member' }),
      })

      expect(await store.joinSharedRoom('their-room')).toEqual({ ok: true })

      expect(appStore.getTab('their-room')?.name).toBe('Their plan')
      expect(appStore.getTabState('their-room').role).toBe('member')
      expect(appStore.getCurrentTab().id).toBe('their-room')
    })

    it('reports the server code so the caller can ask for a password', async () => {
      vi.mocked(api.joinRoom).mockRejectedValue(
        new ApiError(401, 'This room needs its invite password.', { code: 'password_required' })
      )

      expect(await store.joinSharedRoom('their-room')).toEqual({
        ok: false,
        code: 'password_required',
        message: 'This room needs its invite password.',
      })
    })

    it('makes a logged-out joiner an anonymous pointer, not a member', () => {
      store.trackJoinedRoom('their-room', { name: 'Their plan', visitorToken: 'jwt' })

      expect(appStore.getTabState('their-room').kind).toBe('joined')
      expect(api.joinRoom).not.toHaveBeenCalled()
    })

    it('reconnects joined tabs after a reload, which no room list would', () => {
      const tab = localTab('Visiting')
      appStore.setTabState(tab.id, { kind: 'joined', shared: true, role: 'member', revision: null })
      setVisitorToken(tab.id, 'stored-jwt')
      const track = vi.spyOn(roomSync, 'trackRoom')

      store.restoreJoinedTabs()

      expect(track).toHaveBeenCalledWith(tab.id, { visitorToken: 'stored-jwt' })
    })

    it('forgets the visitor token when access is revoked', async () => {
      const tab = localTab('Visiting')
      listReturns([entry({ roomId: tab.id, shared: true })])
      await store.refresh()
      setVisitorToken(tab.id, 'stored-jwt')

      // The room list no longer carries it: the tab becomes a local copy.
      listReturns([])
      await store.refresh()

      expect(readVisitorToken(tab.id)).toBeUndefined()
    })

    it('turns an anonymous joined tab into a membership once the user signs in', async () => {
      const tab = localTab('Visiting')
      appStore.setTabState(tab.id, { kind: 'joined', shared: true, role: 'member', revision: null })
      setVisitorToken(tab.id, 'stored-jwt')
      const room = entry({ roomId: tab.id, shared: true, role: 'member' })
      vi.mocked(api.joinRoom).mockResolvedValue({ status: 'joined', room })
      // The membership exists by the time the list is read, so the refresh keeps it.
      listReturns([room])

      await store.begin()

      expect(api.joinRoom).toHaveBeenCalledWith(tab.id, 'stored-jwt')
      expect(appStore.getTabState(tab.id).kind).toBe('synced')
    })

    it('leaves local and synced tabs out of that sweep', () => {
      const tab = localTab('Mine')
      const track = vi.spyOn(roomSync, 'trackRoom')

      store.restoreJoinedTabs()

      expect(track).not.toHaveBeenCalledWith(tab.id, expect.anything())
    })
  })

  describe('offline mode', () => {
    beforeEach(() => {
      roomSync.enterOffline()
    })

    it('refuses every room mutation without issuing a request', async () => {
      const tab = localTab('Mine')
      appStore.setTabState(tab.id, { kind: 'synced', shared: true, role: 'owner', revision: 1 })

      expect(await store.createSyncedTab('New')).toBe(OFFLINE_MESSAGE)
      expect(await store.renameTab(tab.id, 'Renamed')).toBe(OFFLINE_MESSAGE)
      expect(await store.removeTab(tab.id)).toBe(OFFLINE_MESSAGE)
      expect(await store.shareTab(tab.id)).toBe(OFFLINE_MESSAGE)
      expect(await store.unshareTab(tab.id)).toBe(OFFLINE_MESSAGE)
      expect(await store.setTabPassword(tab.id, 'hunter2')).toBe(OFFLINE_MESSAGE)
      expect(await store.removeTabPassword(tab.id)).toBe(OFFLINE_MESSAGE)
      expect(await store.joinSharedRoom('their-room')).toEqual({
        ok: false,
        code: 'offline',
        message: OFFLINE_MESSAGE,
      })

      for (const call of [api.createRoom, api.renameRoom, api.deleteRoom, api.shareRoom,
        api.unshareRoom, api.setRoomPassword, api.removeRoomPassword, api.joinRoom]) {
        expect(call).not.toHaveBeenCalled()
      }
    })

    // The room list is authoritative for synced order and is refetched on the way
    // out of offline mode, so an order dragged here would be undone seconds later.
    it('refuses a reorder of the synced tabs and puts the bar back', async () => {
      const tab = localTab('Mine')
      appStore.addTab({ id: 'room-a', name: 'A', factories: [] }, { activate: false })
      appStore.addTab({ id: 'room-b', name: 'B', factories: [] }, { activate: false })
      store.entries['room-a'] = entry({ roomId: 'room-a', order: 0 })
      store.entries['room-b'] = entry({ roomId: 'room-b', order: 1 })

      expect(await store.reorderTabs([tab.id, 'room-b', 'room-a'])).toBe(OFFLINE_MESSAGE)

      expect(api.reorderRooms).not.toHaveBeenCalled()
      expect(appStore.getTabs().map(t => t.id)).toEqual([tab.id, 'room-a', 'room-b'])
    })

    // Nothing the server tracks changed, so nothing can undo it on the way back.
    it('still moves a local tab about, which the server order cannot clobber', async () => {
      const tab = localTab('Mine')
      appStore.addTab({ id: 'room-a', name: 'A', factories: [] }, { activate: false })
      store.entries['room-a'] = entry({ roomId: 'room-a', order: 0 })

      expect(await store.reorderTabs(['room-a', tab.id])).toBe(true)

      expect(api.reorderRooms).not.toHaveBeenCalled()
      expect(appStore.getTabs().map(t => t.id)).toEqual(['room-a', tab.id])
    })

    it('still renames a local tab, which needs nothing from the server', async () => {
      const tab = localTab('Mine')

      expect(await store.renameTab(tab.id, 'Renamed')).toBe(true)
      expect(appStore.getTab(tab.id)?.name).toBe('Renamed')
    })

    it('does not fetch the room list', async () => {
      expect(await store.refresh()).toBe(false)
      expect(api.listRooms).not.toHaveBeenCalled()
    })
  })

  describe('staying in step with the socket', () => {
    it('refetches the list when the handshake reports a revision it has not seen', async () => {
      listReturns([], 4)
      await store.refresh()
      vi.mocked(api.listRooms).mockClear()

      // hello_ok on a reconnect: a rooms_changed lost while the socket was down
      // shows up as a counter this client never saw.
      roomSync.roomsRevision = 7
      await nextTick()

      expect(api.listRooms).toHaveBeenCalled()
    })

    it('does not refetch when the socket reports the revision it already holds', async () => {
      listReturns([], 4)
      await store.refresh()
      vi.mocked(api.listRooms).mockClear()

      roomSync.roomsRevision = 4
      await nextTick()

      expect(api.listRooms).not.toHaveBeenCalled()
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
