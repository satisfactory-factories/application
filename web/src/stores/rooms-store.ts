import { defineStore } from 'pinia'
import { ref, toRaw, watch } from 'vue'
import type { RoomListEntry } from 'common'
import * as api from '@/api/client'
import { ApiError, ApiNetworkError, VersionMismatchError } from '@/api/client'
import { useAppStore } from '@/stores/app-store'
import { useAuthStore } from '@/stores/auth-store'
import { useRoomSyncStore } from '@/stores/room-sync-store'
import { removeTabMirrorMeta } from '@/sync/tab-mirror-meta'
import eventBus from '@/utils/eventBus'

/** How long a revocation or adoption notice sits on screen. Never blocking. */
const NOTICE_MS = 8000

const describe = (error: unknown): string => {
  if (error instanceof VersionMismatchError) return 'This version of the planner is out of date. Please refresh.'
  if (error instanceof ApiNetworkError) return 'The server could not be reached.'
  if (error instanceof ApiError) return error.message
  return error instanceof Error ? error.message : 'Unknown error'
}

/**
 * The membership half of the tab bar: which tabs are rooms, adoption of the ones
 * that are not, and the conversion back to local when access goes away. The
 * socket engine is `room-sync-store`; this store owns the REST side and drives
 * the per-tab lifecycle state in `app-store`.
 */
export const useRoomsStore = defineStore('rooms', () => {
  const appStore = useAppStore()
  const roomSync = useRoomSyncStore()

  const entries = ref<Record<string, RoomListEntry>>({})
  const roomsRevision = ref<number | null>(null)
  const refreshing = ref(false)
  const lastError = ref<string | null>(null)

  /** Tab ids the adoption offer is currently about. */
  const adoptionCandidates = ref<string[]>([])
  const adoptionOpen = ref(false)
  const adopting = ref(false)

  // ===== Room list =====

  const refresh = async ({ offerAdoption = false } = {}): Promise<boolean> => {
    const authStore = useAuthStore()
    if (!authStore.isLoggedIn || roomSync.isSuppressed || refreshing.value) return false

    refreshing.value = true
    try {
      const response = await api.listRooms()
      roomsRevision.value = response.roomsRevision
      applyRoomList(response.rooms)
      roomSync.roomsListStale = false
      if (offerAdoption) await openAdoptionOffer(response.rooms)
      return true
    } catch (error) {
      lastError.value = describe(error)
      return false
    } finally {
      refreshing.value = false
    }
  }

  /**
   * The list is the authority on which tabs are synced. A room with no tab here
   * is one made on another device, and a synced tab the list no longer carries
   * has had its access revoked.
   */
  const applyRoomList = (list: RoomListEntry[]) => {
    const known = new Map(list.map(entry => [entry.roomId, entry]))
    entries.value = Object.fromEntries(known)

    for (const tab of appStore.getTabs()) {
      if (appStore.getTabState(tab.id).kind === 'synced' && !known.has(tab.id)) {
        convertToLocal(tab.id, 'access')
      }
    }

    for (const entry of list) {
      if (!appStore.getTab(entry.roomId)) {
        appStore.addTab({ id: entry.roomId, name: entry.name, factories: [] }, { activate: false })
      }
      appStore.setTabState(entry.roomId, {
        kind: 'synced',
        shared: entry.shared,
        role: entry.role,
        revision: entry.revision,
      })
      roomSync.trackRoom(entry.roomId)
    }

    // Both per-tab sidecars are swept against the live tab list here; nothing else
    // runs regularly enough to stop them growing for the lifetime of the browser.
    appStore.pruneTabStates()
    roomSync.pruneMirrorMeta()
  }

  // ===== Revocation =====

  /** The tab keeps every byte it had and quietly stops being a room. */
  const convertToLocal = (roomId: string, reason: 'deleted' | 'access') => {
    const tab = appStore.getTab(roomId)
    appStore.markTabLocal(roomId)
    roomSync.untrackRoom(roomId)
    delete entries.value[roomId]
    if (!tab) return

    eventBus.emit('toast', {
      message: reason === 'deleted'
        ? `"${tab.name}" was deleted by its owner. Your copy is kept as a local tab.`
        : `"${tab.name}" is no longer shared with you. Your copy is kept as a local tab.`,
      type: 'warning',
      timeout: NOTICE_MS,
    })
  }

  /** Mirrors the engine's live revision into the tab state and reacts to lost access. */
  const reconcileRooms = () => {
    for (const room of Object.values(roomSync.rooms)) {
      if (room.status === 'deleted') {
        convertToLocal(room.roomId, 'deleted')
        continue
      }
      if (room.status === 'revoked') {
        convertToLocal(room.roomId, 'access')
        continue
      }

      const state = appStore.getTabState(room.roomId)
      if (state.kind === 'local') continue

      // The shared flag follows room_meta the moment it lands, but a revision only
      // means anything once the room is actually in sync.
      const shared = room.meta?.shared ?? state.shared
      const revision = room.status === 'synced' ? room.revision : state.revision
      if (state.revision === revision && state.shared === shared) continue
      appStore.setTabState(room.roomId, { revision, shared })
    }
  }

  // ===== Adoption =====

  const openAdoptionOffer = async (list: RoomListEntry[]) => {
    const known = new Set(list.map(entry => entry.roomId))
    // The bar always holds at least the "Default" tab, so an empty one is not a
    // plan: "zero local tabs" means nothing here is worth keeping.
    const candidates = appStore.getTabs().filter(tab =>
      !known.has(tab.id) &&
      appStore.getTabState(tab.id).kind === 'local' &&
      tab.factories.length > 0
    )

    if (list.length === 0 && candidates.length === 0) {
      await autoImportLegacy(candidates.length)
      return
    }
    if (candidates.length === 0) return

    adoptionCandidates.value = candidates.map(tab => tab.id)
    adoptionOpen.value = true
  }

  /** Only an account with no rooms in a browser with no plans; anything else asks. */
  const autoImportLegacy = async (localTabCount: number) => {
    try {
      // Sent rather than hardcoded so the server's own eligibility gate is real.
      const result = await api.legacyAutoImport(localTabCount)
      if (!result.imported) return
      eventBus.emit('toast', {
        message: 'Recovered the plan previously saved to your account.',
        type: 'success',
        timeout: NOTICE_MS,
      })
      await refresh()
    } catch (error) {
      lastError.value = describe(error)
    }
  }

  const adoptTabs = async (tabIds: string[]): Promise<void> => {
    adopting.value = true
    const taken = new Set(Object.values(entries.value).map(entry => entry.name))

    try {
      for (const tabId of tabIds) {
        const tab = appStore.getTab(tabId)
        if (!tab) continue
        const name = taken.has(tab.name) ? `${tab.name} (local)` : tab.name
        if (await adoptOne(tabId, name)) taken.add(name)
      }
    } finally {
      adopting.value = false
      declineAdoption()
    }

    await refresh()
  }

  const adoptOne = async (tabId: string, name: string, rekeyed = false): Promise<boolean> => {
    const tab = appStore.getTab(tabId)
    if (!tab) return false

    try {
      const { room } = await api.adoptRoom({
        roomId: tab.id,
        name,
        factories: toRaw(tab.factories),
        powerTarget: tab.powerTarget ?? 0,
        groups: toRaw(tab.groups ?? []),
      })

      if (name !== tab.name) appStore.renameTab(tab.id, name)
      entries.value[room.roomId] = room
      appStore.setTabState(tab.id, {
        kind: 'synced',
        shared: room.shared,
        role: room.role,
        revision: room.revision,
      })
      roomSync.trackRoom(tab.id)
      return true
    } catch (error) {
      // Someone else's room already holds that UUID, so the tab takes a fresh one.
      // Adoption is create-only, so re-keying can never overwrite their plan.
      if (!rekeyed && error instanceof ApiError && error.code === 'room_id_taken') {
        const freshId = crypto.randomUUID()
        removeTabMirrorMeta(tabId)
        if (appStore.rekeyTab(tabId, freshId)) return adoptOne(freshId, name, true)
      }

      lastError.value = describe(error)
      eventBus.emit('toast', {
        message: `"${name}" could not be synced: ${describe(error)}`,
        type: 'error',
        timeout: NOTICE_MS,
      })
      return false
    }
  }

  /** Declining leaves every candidate exactly as it was: local, and kept. */
  const declineAdoption = () => {
    adoptionOpen.value = false
    adoptionCandidates.value = []
  }

  // ===== Tab actions =====

  const createSyncedTab = async (name = 'New Tab'): Promise<true | string> => {
    const authStore = useAuthStore()
    if (!authStore.isLoggedIn) return 'Sign in first to create a synced tab.'

    const roomId = crypto.randomUUID()
    try {
      // The tab is only created once the server has the room, so a failure
      // leaves nothing half-made in the bar.
      const { room } = await api.createRoom({ roomId, name, factories: [], powerTarget: 0, groups: [] })
      appStore.addTab({ id: roomId, name, factories: [] })
      entries.value[room.roomId] = room
      appStore.setTabState(roomId, {
        kind: 'synced',
        shared: room.shared,
        role: room.role,
        revision: room.revision,
      })
      roomSync.trackRoom(roomId)
      return true
    } catch (error) {
      lastError.value = describe(error)
      return describe(error)
    }
  }

  const canRename = (tabId: string): boolean => {
    const state = appStore.getTabState(tabId)
    return state.kind === 'local' || (state.kind === 'synced' && state.role === 'owner')
  }

  /**
   * A synced rename goes through the server so it reaches every device and every
   * member; a purely local rename used to be the silent hole in the old sync.
   */
  const renameTab = async (tabId: string, name: string): Promise<true | string> => {
    const trimmed = name.trim()
    if (trimmed === '') return 'A tab needs a name.'

    const state = appStore.getTabState(tabId)
    if (state.kind === 'local') {
      appStore.renameTab(tabId, trimmed)
      return true
    }
    if (state.role !== 'owner') return 'Only the owner can rename this plan.'

    const previous = appStore.getTab(tabId)?.name ?? trimmed
    appStore.renameTab(tabId, trimmed)
    try {
      const { room } = await api.renameRoom(tabId, trimmed)
      entries.value[room.roomId] = room
      return true
    } catch (error) {
      appStore.renameTab(tabId, previous)
      lastError.value = describe(error)
      return describe(error)
    }
  }

  const duplicateAsLocal = (tabId: string): string | null => appStore.duplicateTab(tabId)

  /** Owner deletes the room for everyone; a member only drops their own membership. */
  const removeTab = async (tabId: string): Promise<true | string> => {
    const state = appStore.getTabState(tabId)

    if (state.kind === 'synced') {
      try {
        await (state.role === 'owner' ? api.deleteRoom(tabId) : api.leaveRoom(tabId))
      } catch (error) {
        // Already gone server-side is the outcome we were asking for.
        if (!(error instanceof ApiError && error.status === 404)) {
          lastError.value = describe(error)
          return describe(error)
        }
      }
    }

    delete entries.value[tabId]
    roomSync.untrackRoom(tabId)
    appStore.markTabLocal(tabId)
    return true
  }

  /** The `/room/:slug` page's entry point: an anonymous pointer into someone's room. */
  const trackJoinedRoom = (
    roomId: string,
    { name = 'Shared plan', visitorToken }: { name?: string, visitorToken?: string } = {},
  ) => {
    if (!appStore.getTab(roomId)) appStore.addTab({ id: roomId, name, factories: [] })
    appStore.setTabState(roomId, { kind: 'joined', shared: true, role: 'member', revision: null })
    roomSync.trackRoom(roomId, { visitorToken })
  }

  // ===== Session =====

  /** Called once the session is known good: connect, then pull the tab list. */
  const begin = async (): Promise<void> => {
    const authStore = useAuthStore()
    if (!authStore.isLoggedIn) return
    roomSync.start()
    await refresh({ offerAdoption: true })
  }

  /** Signing out keeps every plan; they simply stop being rooms in this browser. */
  const signOut = () => {
    for (const roomId of Object.keys(entries.value)) {
      roomSync.untrackRoom(roomId)
      appStore.markTabLocal(roomId)
    }
    entries.value = {}
    roomsRevision.value = null
    declineAdoption()
    roomSync.stop()
  }

  const onLoggedIn = () => {
    void begin()
  }

  eventBus.on('loggedIn', onLoggedIn)
  eventBus.on('sessionExpired', signOut)

  const stopStale = watch(() => roomSync.roomsListStale, stale => {
    if (stale) void refresh()
  })

  const stopRooms = watch(
    // `shared` is in the key so an owner's second device flips the tab icon the
    // moment room_meta lands, rather than waiting for the room list to be refetched.
    () => Object.values(roomSync.rooms)
      .map(room => `${room.roomId}|${room.status}|${room.revision}|${room.meta?.shared ?? ''}`)
      .join(','),
    () => reconcileRooms()
  )

  const dispose = () => {
    eventBus.off('loggedIn', onLoggedIn)
    eventBus.off('sessionExpired', signOut)
    stopStale()
    stopRooms()
  }

  return {
    // State
    entries,
    roomsRevision,
    refreshing,
    lastError,
    adoptionCandidates,
    adoptionOpen,
    adopting,

    // Room list
    refresh,
    begin,
    signOut,
    dispose,

    // Adoption
    adoptTabs,
    declineAdoption,

    // Tab actions
    createSyncedTab,
    canRename,
    renameTab,
    duplicateAsLocal,
    removeTab,
    trackJoinedRoom,

    // Driven by the engine, and directly by tests
    reconcileRooms,
  }
})
