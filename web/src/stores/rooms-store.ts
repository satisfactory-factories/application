import { defineStore } from 'pinia'
import { ref, toRaw, watch } from 'vue'
import type { LegacyImportResult, RoomListEntry } from 'common'
import * as api from '@/api/client'
import { ApiError, ApiNetworkError, VersionMismatchError } from '@/api/client'
import { config } from '@/config/config'
import { useAppStore } from '@/stores/app-store'
import { useAuthStore } from '@/stores/auth-store'
import { useRoomSyncStore } from '@/stores/room-sync-store'
import { hasAnsweredAdoption, rememberAdoptionAnswer } from '@/sync/adoption-answers'
import { removeTabMirrorMeta } from '@/sync/tab-mirror-meta'
import { interleaveTabOrder, sameOrder, syncedTabOrder } from '@/sync/tab-order'
import { readVisitorTokens, removeVisitorToken } from '@/sync/visitor-tokens'
import eventBus from '@/utils/eventBus'

/** How long a revocation or adoption notice sits on screen. Never blocking. */
const NOTICE_MS = 8000

/** A failed join carries the server's code, so the caller can ask for a password. */
export type JoinOutcome = { ok: true } | { ok: false, code: string | null, message: string }

/** Offline mode is total backend silence, so every REST action refuses rather than queues. */
export const OFFLINE_MESSAGE = 'You are in offline mode. Turn it off to change what is on the server.'

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
  /**
   * Why the offer is up. `sign-in` is the sweep of everything this browser holds,
   * answered once per account; `landed` is one plan that has just arrived in a
   * local tab, which is a question in its own right and records no answer.
   */
  const adoptionReason = ref<'sign-in' | 'landed'>('sign-in')

  /** Room ids the login chooser is currently offering. */
  const chooserCandidates = ref<string[]>([])
  const chooserOpen = ref(false)
  const chooserOpening = ref(false)

  /** The pre-v0.7 save this account still holds, once a sign-in has found one. */
  const legacyOpen = ref(false)
  const legacyFactoryCount = ref(0)
  const legacyImporting = ref(false)

  /** The one gate every room mutation passes through; offline means no request at all. */
  const blocked = (): string | null => roomSync.isSuppressed ? OFFLINE_MESSAGE : null

  // ===== Room list =====

  /** The list request in flight, so two callers share one rather than one being dropped. */
  let inFlight: Promise<RoomListEntry[] | null> | null = null

  const fetchRooms = async (): Promise<RoomListEntry[] | null> => {
    refreshing.value = true
    try {
      const response = await api.listRooms()
      roomsRevision.value = response.roomsRevision
      applyRoomList(response.rooms)
      roomSync.roomsListStale = false
      return response.rooms
    } catch (error) {
      lastError.value = describe(error)
      return null
    } finally {
      refreshing.value = false
      inFlight = null
    }
  }

  /**
   * Overlapping callers join the request already in flight instead of being turned
   * away: opening the account tray refreshes the list, and it opens straight after a
   * login, which is the same moment the login sequence asks for the list plus the
   * adoption offer. Turning the second one away lost the offer entirely.
   */
  const refresh = async (
    { offerAdoption = false, offerChooser = false, offerLegacy = false } = {},
  ): Promise<boolean> => {
    const authStore = useAuthStore()
    if (!authStore.isLoggedIn || roomSync.isSuppressed) return false

    inFlight ??= fetchRooms()
    const rooms = await inFlight
    if (rooms === null) return false

    // Only an account that owns no cloud plan is offered its old save, so the
    // question costs a request on the logins that could act on it and no other.
    const legacy = offerLegacy && !rooms.some(room => room.role === 'owner')
      ? await findLegacyPlan()
      : null

    // One dialog at a time. The chooser fronts an interactive login and the rest
    // are parked; every answer releases the next offer that is still due.
    if (offerChooser && openPlanChooser(rooms)) {
      parked = { adoption: offerAdoption ? rooms : null, legacy }
    } else if (offerAdoption && await openAdoptionOffer(rooms)) {
      parked = { adoption: null, legacy }
    } else if (legacy !== null) {
      openLegacyOffer(legacy)
    }
    return true
  }

  /**
   * The list is the authority on which tabs are synced, and the tab bar is the
   * authority on which rooms are open: a room with no tab here is hidden in this
   * browser and stays that way — the list never opens a tab on its own, so a
   * refresh, a reconnect or a login cannot un-hide a plan. A synced tab the list
   * no longer carries has had its access revoked.
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
      if (!appStore.getTab(entry.roomId)) continue
      appStore.setTabState(entry.roomId, {
        kind: 'synced',
        shared: entry.shared,
        role: entry.role,
        revision: entry.revision,
      })
      roomSync.trackRoom(entry.roomId)
    }

    applyServerOrder(list)

    // Both per-tab sidecars are swept against the live tab list here; nothing else
    // runs regularly enough to stop them growing for the lifetime of the browser.
    appStore.pruneTabStates()
    roomSync.pruneMirrorMeta()
  }

  /** Membership order is per user, so it reaches this device with the room list. */
  const applyServerOrder = (list: RoomListEntry[]) => {
    const known = new Set(list.map(entry => entry.roomId))
    const serverOrder = [...list].sort((a, b) => a.order - b.order).map(entry => entry.roomId)
    const tabIds = appStore.getTabs().map(tab => tab.id)

    appStore.reorderTabs(interleaveTabOrder(tabIds, serverOrder, tabId => known.has(tabId)))
  }

  // ===== Opening and hiding cloud plans =====

  /** Open/hide refusals surface as toasts here, so no caller can drop one silently. */
  const refuse = (message: string): string => {
    lastError.value = message
    eventBus.emit('toast', { message, type: 'error', timeout: NOTICE_MS })
    return message
  }

  /**
   * Opens a cloud plan into this browser's tab bar. The tab starts empty and the
   * socket join fills it, exactly as every synced tab loads; the room and the
   * membership already exist, so nothing is written server-side. Idempotent: an
   * open plan is simply brought to the front.
   */
  const openPlan = async (roomId: string): Promise<true | string> => {
    const offline = blocked()
    if (offline) return refuse(offline)

    let entry = entries.value[roomId]
    if (!entry) {
      await refresh()
      entry = entries.value[roomId]
    }
    if (!entry) return refuse('That plan is not on your account.')

    if (!appStore.getTab(roomId)) {
      appStore.addTab({ id: roomId, name: entry.name, factories: [] }, { activate: false })
    }
    appStore.setTabState(roomId, {
      kind: 'synced',
      shared: entry.shared,
      role: entry.role,
      revision: entry.revision,
    })
    roomSync.trackRoom(roomId)
    appStore.activateTab(roomId)
    return true
  }

  /**
   * Unmounts a cloud plan from this browser: the tab, its sync state and its
   * mirror metadata go, the server room and the membership stay untouched. The
   * bar is the per-browser open set, so this is all "hidden" is. Idempotent: a
   * plan with no tab is already hidden.
   */
  const hidePlan = (roomId: string): true | string => {
    const offline = blocked()
    if (offline) return refuse(offline)

    if (!appStore.getTab(roomId)) return true

    const tabs = appStore.getTabs()
    if (tabs.length === 1) {
      return refuse('The tab bar cannot be left empty. Open another plan first.')
    }

    // Never pull the plan out from under the user: move to a neighbouring tab
    // first, so the removal happens behind the view rather than to it.
    if (appStore.getCurrentTab()?.id === roomId) {
      const index = tabs.findIndex(tab => tab.id === roomId)
      const neighbour = tabs[index + 1] ?? tabs[index - 1]
      appStore.activateTab(neighbour.id)
    }

    roomSync.untrackRoom(roomId)
    appStore.removeTab(roomId)
    return true
  }

  // ===== The login chooser =====

  /**
   * The offers waiting behind whichever dialog is up: the room list the adoption
   * offer would be made from, and the size of the old save the recovery offer
   * would name. Cleared without running by a cleanup close like a sign-out.
   */
  let parked: { adoption: RoomListEntry[] | null, legacy: number | null } =
    { adoption: null, legacy: null }

  const dropParked = () => {
    parked = { adoption: null, legacy: null }
  }

  /** An answered dialog hands the floor to the next offer that is still due. */
  const runParkedOffers = async () => {
    const due = parked
    dropParked()
    if (due.adoption && await openAdoptionOffer(due.adoption)) {
      parked = { adoption: null, legacy: due.legacy }
      return
    }
    if (due.legacy !== null) openLegacyOffer(due.legacy)
  }

  /**
   * Offers the account's rooms that have no tab here. Only an interactive
   * sign-in reaches this (the `loggedIn` event path): a refresh with a
   * persisted session keeps the bar it already had, and an account whose every
   * room is already open has nothing to choose. Says whether it opened.
   */
  const openPlanChooser = (list: RoomListEntry[]): boolean => {
    const unopened = list.filter(room => !appStore.getTab(room.roomId))
    if (unopened.length === 0) return false

    chooserCandidates.value = unopened.map(room => room.roomId)
    chooserOpen.value = true
    return true
  }

  /** Opens the ticked plans, in the order they were offered; the rest stay hidden. */
  const openChosenPlans = async (roomIds: string[]): Promise<void> => {
    chooserOpening.value = true
    try {
      for (const roomId of roomIds) {
        await openPlan(roomId)
      }
    } finally {
      chooserOpening.value = false
      closeChooser()
    }
  }

  /**
   * "Not now", or the close after an open run: either way the question is
   * answered and the parked offers may follow. Cleanup closes like sign-out pass
   * `answered: false` — nothing may follow those.
   */
  const closeChooser = (answered = true) => {
    chooserOpen.value = false
    chooserCandidates.value = []
    if (answered) void runParkedOffers()
    else dropParked()
  }

  // ===== Revocation =====

  /**
   * Rooms this browser removed itself. The server's `room_deleted` comes back over the
   * socket to the client that asked for it, and telling someone their own deletion
   * worked is noise; a peer losing a plan under them is not.
   */
  const selfRemoved = new Set<string>()

  /** The tab keeps every byte it had and quietly stops being a room. */
  const convertToLocal = (roomId: string, reason: 'deleted' | 'access') => {
    const tab = appStore.getTab(roomId)
    appStore.markTabLocal(roomId)
    roomSync.untrackRoom(roomId)
    removeVisitorToken(roomId)
    delete entries.value[roomId]
    if (!tab) return
    if (selfRemoved.delete(roomId)) return

    // Losing a plan someone else deleted is not something to catch out of the corner
    // of an eye, so it waits to be dismissed. An unshare leaves a working copy behind
    // and can time out.
    const deleted = reason === 'deleted'
    eventBus.emit('toast', {
      message: deleted
        ? `"${tab.name}" was deleted by its owner. Your copy is kept as a local tab.`
        : `"${tab.name}" is no longer shared with you. Your copy is kept as a local tab.`,
      type: 'warning',
      variant: deleted ? 'permanent' : 'timed',
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

  /** Says whether it put the dialog on screen, so the caller knows the floor is taken. */
  const openAdoptionOffer = async (list: RoomListEntry[]): Promise<boolean> => {
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
      return false
    }
    if (candidates.length === 0) return false

    // Asked and answered: one prompt per account in this browser, however many
    // refreshes follow. The plus button stays the way to sync a plan after a
    // "No thanks" — and a second account signing in here has answered nothing.
    if (hasAnsweredAdoption(useAuthStore().getLoggedInUser())) return false

    adoptionCandidates.value = candidates.map(tab => tab.id)
    adoptionReason.value = 'sign-in'
    adoptionOpen.value = true
    return true
  }

  /**
   * One plan, offered the moment it lands in a local tab — a paste, an import, a
   * template. The sign-in sweep is made once and then the browser stops asking,
   * which leaves a plan that arrives afterwards with nothing to point at the
   * cloud; this is that pointer. Silent when there is nothing to offer or a
   * dialog is already up, and it records no answer either way: declining "sync
   * this one" is not an answer about everything else this browser holds.
   */
  const offerTabToCloud = (tabId: string): boolean => {
    if (!useAuthStore().isLoggedIn || blocked()) return false
    if (adoptionOpen.value || chooserOpen.value || legacyOpen.value) return false

    const tab = appStore.getTab(tabId)
    if (!tab || tab.factories.length === 0) return false
    if (appStore.getTabState(tabId).kind !== 'local') return false

    adoptionCandidates.value = [tabId]
    adoptionReason.value = 'landed'
    adoptionOpen.value = true
    return true
  }

  /** Set the moment an import lands, so the offer cannot ask for it a second time. */
  let legacyImported = false

  /** Only an account with no rooms in a browser with no plans; anything else asks. */
  const autoImportLegacy = async (localTabCount: number) => {
    if (blocked()) return
    try {
      // Sent rather than hardcoded so the server's own eligibility gate is real.
      const result = await api.legacyAutoImport(localTabCount)
      if (!result.imported) return
      await landRecoveredPlan(result)
    } catch (error) {
      lastError.value = describe(error)
    }
  }

  /** The toast, the list refresh and the mount every recovered plan needs. */
  const landRecoveredPlan = async (result: LegacyImportResult) => {
    legacyImported = true
    // A cloud plan holds 150 factories, and an old save could be bigger. Saying how
    // many were left behind is the difference between a partial recovery and a
    // silent one.
    const dropped = result.dropped ?? 0
    eventBus.emit('toast', {
      message: dropped > 0
        ? `Recovered the plan previously saved to your account. It was too big for a cloud plan, so the last ${dropped} ${dropped === 1 ? 'factory' : 'factories'} could not be brought over.`
        : 'Recovered the plan previously saved to your account.',
      type: dropped > 0 ? 'warning' : 'success',
      variant: dropped > 0 ? 'permanent' : 'timed',
      timeout: NOTICE_MS,
    })
    await refresh()
    // The list never opens tabs, and a recovered plan announced by a toast
    // must actually be on screen.
    if (result.room) await openPlan(result.room.roomId)
  }

  // ===== The account-recovery offer =====

  /**
   * How big the account's old save is, or null when there is nothing to offer.
   * A failed check simply offers nothing: the plan is not going anywhere, and the
   * next sign-in asks again.
   */
  const findLegacyPlan = async (): Promise<number | null> => {
    if (blocked()) return null
    try {
      const status = await api.legacyStatus()
      return status.exists ? status.factoryCount : null
    } catch (error) {
      lastError.value = describe(error)
      return null
    }
  }

  const openLegacyOffer = (factoryCount: number) => {
    // The auto-import can have taken it during the same sign-in, and recovering
    // twice is exactly what the server refuses.
    if (legacyImported) return
    legacyFactoryCount.value = factoryCount
    legacyOpen.value = true
  }

  /** "Not now" writes nothing at all, so the next sign-in finds the save and asks again. */
  const closeLegacyOffer = () => {
    legacyOpen.value = false
    legacyFactoryCount.value = 0
  }

  /**
   * The offer's yes. The tab it mounts starts empty and the socket join fills it,
   * so a pre-v0.6 plan arrives through the loader's validation and migration path
   * exactly as any other plan load does.
   */
  const importLegacyPlan = async (): Promise<true | string> => {
    const offline = blocked()
    if (offline) {
      closeLegacyOffer()
      return refuse(offline)
    }

    legacyImporting.value = true
    try {
      const result = await api.legacyRecover()
      if (!result.imported) return refuse('That plan could not be recovered.')
      await landRecoveredPlan(result)
      return true
    } catch (error) {
      lastError.value = describe(error)
      return refuse(describe(error))
    } finally {
      legacyImporting.value = false
      closeLegacyOffer()
    }
  }

  const adoptTabs = async (tabIds: string[]): Promise<void> => {
    if (blocked()) {
      lastError.value = OFFLINE_MESSAGE
      declineAdoption()
      return
    }

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
      declineAdoption(true)
    }

    await refresh()
  }

  const adoptOne = async (tabId: string, name: string, rekeyed = false): Promise<boolean> => {
    const tab = appStore.getTab(tabId)
    if (!tab) return false

    try {
      // The room becomes the authoritative copy the moment it exists, and the first
      // snapshot writes every content field back over the tab — absent as absent. So
      // the payload must carry everything the tab knows, or adoption erases it: a
      // dropped `plannerVersion` re-raises the raw-resources notice the user already
      // answered, and dropped Depot tiers quietly read as fully researched.
      const { room } = await api.adoptRoom({
        roomId: tab.id,
        name,
        factories: toRaw(tab.factories),
        powerTarget: tab.powerTarget ?? 0,
        depotUploadTier: tab.depotUploadTier,
        depotExpansionTier: tab.depotExpansionTier,
        plannerVersion: tab.plannerVersion,
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

  /**
   * Declining leaves every candidate exactly as it was: local, and kept.
   * `remember` is true only for a real answer (No thanks, or an adoption run) —
   * never for cleanup closes like sign-out, which must not silence the offer.
   */
  const declineAdoption = (remember = false) => {
    // Only the sweep's answer is the browser's: "not this one" says nothing about
    // the plans the sign-in offer would ask about.
    if (remember && adoptionReason.value === 'sign-in') {
      rememberAdoptionAnswer(useAuthStore().getLoggedInUser())
    }
    adoptionOpen.value = false
    adoptionCandidates.value = []
    // Same rule as the chooser: a real answer hands the floor on, a cleanup close
    // drops what was waiting behind it.
    if (remember) void runParkedOffers()
    else dropParked()
  }

  // ===== Tab actions =====

  const createSyncedTab = async (name = 'New Tab'): Promise<true | string> => {
    const authStore = useAuthStore()
    if (!authStore.isLoggedIn) return 'Sign in first to create a synced tab.'
    const offline = blocked()
    if (offline) return offline

    const roomId = crypto.randomUUID()
    try {
      // The tab is only created once the server has the room, so a failure
      // leaves nothing half-made in the bar. The room carries the answered-for
      // stamp `addTab` gives every brand-new empty tab: the room is authoritative,
      // so a room created without it would blank the tab's stamp on the first
      // snapshot and raise the raw-resources notice on a plan born after v0.6.
      const { room } = await api.createRoom({
        roomId,
        name,
        factories: [],
        powerTarget: 0,
        plannerVersion: config.plannerVersion,
        groups: [],
      })
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
    const offline = blocked()
    if (offline) return offline

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

  /**
   * Lays the bar out as dragged, then pushes the synced half to the account so the
   * user's other devices pick it up. Local tabs have no row on the server to hold
   * an index, so they are simply left out of the push; `tab-order.ts` states how
   * the two halves meet again when a server order comes back.
   */
  const reorderTabs = async (orderedIds: string[]): Promise<true | string> => {
    const previous = appStore.getTabs().map(tab => tab.id)
    if (!appStore.reorderTabs(orderedIds)) return 'That order does not match the tabs on screen.'

    const synced = syncedTabOrder(orderedIds, tabId => tabId in entries.value)
    // Hidden rooms have no slot in the bar, so they are left out of the
    // comparison too — otherwise every drag would read as a change.
    const stored = Object.values(entries.value)
      .filter(entry => appStore.getTab(entry.roomId) !== undefined)
      .sort((a, b) => a.order - b.order)
      .map(entry => entry.roomId)
    // Dragging local tabs about changes nothing the server tracks, and a pointless
    // bump would make every other device refetch its list.
    if (sameOrder(synced, stored)) return true

    const offline = blocked()
    if (offline) {
      appStore.reorderTabs(previous)
      return offline
    }

    try {
      const response = await api.reorderRooms(synced)
      roomsRevision.value = response.roomsRevision
      applyRoomList(response.rooms)
      return true
    } catch (error) {
      appStore.reorderTabs(previous)
      lastError.value = describe(error)
      return describe(error)
    }
  }

  /** Owner deletes the room for everyone; a member only drops their own membership. */
  const removeTab = async (tabId: string): Promise<true | string> => {
    const state = appStore.getTabState(tabId)

    if (state.kind === 'synced') {
      const offline = blocked()
      if (offline) return offline
      // Set before the request: the fan-out can reach this client's own socket
      // before the response does, and the notice is for everyone but us.
      selfRemoved.add(tabId)
      try {
        await (state.role === 'owner' ? api.deleteRoom(tabId) : api.leaveRoom(tabId))
      } catch (error) {
        // Already gone server-side is the outcome we were asking for.
        if (!(error instanceof ApiError && error.status === 404)) {
          // The tab is still a room, so a later deletion by its owner is news again.
          selfRemoved.delete(tabId)
          lastError.value = describe(error)
          return describe(error)
        }
      }
    }

    delete entries.value[tabId]
    roomSync.untrackRoom(tabId)
    removeVisitorToken(tabId)
    appStore.markTabLocal(tabId)
    return true
  }

  // ===== Sharing =====

  /** Every share control returns `true` or the message to show; entries stay authoritative. */
  const applyEntry = (entry: RoomListEntry): true => {
    entries.value[entry.roomId] = entry
    appStore.setTabState(entry.roomId, {
      kind: 'synced',
      shared: entry.shared,
      role: entry.role,
      revision: entry.revision,
    })
    return true
  }

  /** One shape for every owner-only control: silent while offline, message on failure. */
  const roomAction = async (act: () => Promise<void>): Promise<true | string> => {
    const offline = blocked()
    if (offline) return offline

    try {
      await act()
      return true
    } catch (error) {
      lastError.value = describe(error)
      return describe(error)
    }
  }

  const shareTab = (tabId: string, slug?: string): Promise<true | string> =>
    roomAction(async () => {
      applyEntry((await api.shareRoom(tabId, slug)).room)
    })

  /** Makes the plan private again: memberships go, and so does the live link. */
  const unshareTab = (tabId: string): Promise<true | string> =>
    roomAction(async () => {
      applyEntry((await api.unshareRoom(tabId)).room)
    })

  const setTabPassword = (tabId: string, password: string): Promise<true | string> =>
    roomAction(async () => {
      await api.setRoomPassword(tabId, password)
      const entry = entries.value[tabId]
      if (entry) entries.value[tabId] = { ...entry, hasPassword: true }
    })

  const removeTabPassword = (tabId: string): Promise<true | string> =>
    roomAction(async () => {
      await api.removeRoomPassword(tabId)
      const entry = entries.value[tabId]
      if (entry) entries.value[tabId] = { ...entry, hasPassword: false }
    })

  // ===== Joining someone else's room =====

  /**
   * The `/room/:slug` page's logged-in path: a durable membership on every device.
   * Reports the server's `code` because the page has to tell "wrong password" from
   * "gone" without reading the message text.
   */
  const joinSharedRoom = async (
    roomId: string,
    { name = 'Shared plan', visitorToken, activate = true }: {
      name?: string
      visitorToken?: string
      /** False when upgrading a joined tab in the background: never yank the user's view. */
      activate?: boolean
    } = {},
  ): Promise<JoinOutcome> => {
    const offline = blocked()
    if (offline) return { ok: false, code: 'offline', message: offline }

    try {
      const { room } = await api.joinRoom(roomId, visitorToken)
      if (!appStore.getTab(roomId)) {
        appStore.addTab({ id: roomId, name: room.name || name, factories: [] })
      }
      applyEntry(room)
      roomSync.trackRoom(roomId, { visitorToken })
      if (activate) appStore.activateTab(roomId)
      return { ok: true }
    } catch (error) {
      const message = describe(error)
      lastError.value = message
      return {
        ok: false,
        code: error instanceof ApiError ? error.code : null,
        message,
      }
    }
  }

  /** The logged-out path: an anonymous pointer into someone's room, this browser only. */
  const trackJoinedRoom = (
    roomId: string,
    { name = 'Shared plan', visitorToken }: { name?: string, visitorToken?: string } = {},
  ) => {
    if (!appStore.getTab(roomId)) appStore.addTab({ id: roomId, name, factories: [] })
    appStore.setTabState(roomId, { kind: 'joined', shared: true, role: 'member', revision: null })
    roomSync.trackRoom(roomId, { visitorToken })
    appStore.activateTab(roomId)
    if (!useAuthStore().isLoggedIn) roomSync.start()
  }

  /**
   * Nothing else brings a joined tab back after a reload: it has no membership on
   * the server, so `GET /rooms` will never mention it.
   */
  const restoreJoinedTabs = () => {
    const tokens = readVisitorTokens()
    let restored = false

    for (const tab of appStore.getTabs()) {
      if (appStore.getTabState(tab.id).kind !== 'joined') continue
      roomSync.trackRoom(tab.id, { visitorToken: tokens[tab.id] })
      restored = true
    }

    if (restored && !useAuthStore().isLoggedIn) roomSync.start()
  }

  // ===== Session =====

  /**
   * Called once the session is known good: connect, then pull the tab list.
   * Deliberately opens no tabs on its own — the bar this browser already holds
   * is the open set. `interactive` is true only on the `loggedIn` event path (a
   * sign-in the user just performed), and is what lets the login chooser offer
   * the account's unopened rooms; a page refresh with a persisted session
   * arrives here without it and never asks.
   */
  const begin = async ({ interactive = false } = {}): Promise<void> => {
    const authStore = useAuthStore()
    if (!authStore.isLoggedIn) return
    roomSync.start()
    await upgradeJoinedTabs()
    // The recovery offer rides on the same flag as the chooser: a returning user
    // is asked about their old save when they sign in, never on a page refresh.
    await refresh({ offerAdoption: true, offerChooser: interactive, offerLegacy: interactive })
  }

  /**
   * A tab joined anonymously and then signed into becomes a real membership, so it
   * follows the account to every device instead of living in this browser only.
   */
  const upgradeJoinedTabs = async (): Promise<void> => {
    if (blocked()) return
    const tokens = readVisitorTokens()

    for (const tab of appStore.getTabs()) {
      if (appStore.getTabState(tab.id).kind !== 'joined') continue
      await joinSharedRoom(tab.id, {
        name: tab.name,
        visitorToken: tokens[tab.id],
        activate: false,
      })
    }
  }

  /** Signing out keeps every plan; they simply stop being rooms in this browser. */
  const signOut = () => {
    for (const roomId of Object.keys(entries.value)) {
      // The tab survives, and so must the record of what this browser edited and never
      // sent: without it the next sign-in adopts the account's copy over those edits
      // silently, with nothing to raise the conflict prompt. Pruning reaps it with the tab.
      roomSync.untrackRoom(roomId, { keepMirrorMeta: true })
      appStore.markTabLocal(roomId)
    }
    entries.value = {}
    roomsRevision.value = null
    declineAdoption()
    closeChooser(false)
    closeLegacyOffer()
    legacyImported = false
    roomSync.stop()
    // Anonymous joined tabs are nobody's account, so they keep their live link.
    restoreJoinedTabs()
  }

  /**
   * `begin()` runs off the `loggedIn` event, so anything that has to follow the room
   * list landing awaits this instead of racing it. Creating a tab mid-refresh is the
   * case that matters: the list would come back without it and convert it to local.
   */
  let session: Promise<void> = Promise.resolve()
  const whenSessionReady = (): Promise<void> => session.catch(() => undefined)

  const onLoggedIn = () => {
    session = begin({ interactive: true })
  }

  /** A plan pasted or imported into a tab: the one moment its own cloud offer is due. */
  const onPlanLanded = (tabId: string) => { offerTabToCloud(tabId) }

  eventBus.on('loggedIn', onLoggedIn)
  eventBus.on('sessionExpired', signOut)
  eventBus.on('planLanded', onPlanLanded)

  /**
   * `hello_ok` carries the account-wide counter, so every connect re-checks the tab
   * list without a blind refetch: a notification lost while the socket was down
   * shows up as a revision this client has not seen.
   */
  const stopStale = watch(
    () => [roomSync.roomsListStale, roomSync.roomsRevision, roomSync.isSuppressed] as const,
    ([stale, revision, suppressed]) => {
      if (suppressed) return
      if (stale || (revision !== null && revision !== roomsRevision.value)) void refresh()
    }
  )

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
    eventBus.off('planLanded', onPlanLanded)
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
    adoptionReason,
    adopting,
    chooserCandidates,
    chooserOpen,
    chooserOpening,
    legacyOpen,
    legacyFactoryCount,
    legacyImporting,

    // Room list
    refresh,
    begin,
    whenSessionReady,
    signOut,
    dispose,

    // Adoption
    adoptTabs,
    offerTabToCloud,
    declineAdoption,

    // The login chooser
    openChosenPlans,
    closeChooser,

    // The account-recovery offer
    importLegacyPlan,
    closeLegacyOffer,

    // Tab actions
    openPlan,
    hidePlan,
    createSyncedTab,
    canRename,
    renameTab,
    duplicateAsLocal,
    reorderTabs,
    removeTab,

    // Sharing
    shareTab,
    unshareTab,
    setTabPassword,
    removeTabPassword,

    // Joining
    joinSharedRoom,
    trackJoinedRoom,
    restoreJoinedTabs,
    upgradeJoinedTabs,

    // Driven by the engine, and directly by tests
    reconcileRooms,
  }
})
