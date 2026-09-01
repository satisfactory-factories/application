import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { CLOSE_CODES, FIELD_LOCK_TTL_MS, PROTOCOL_VERSION } from 'common'
import type {
  Factory,
  FactoryTab,
  FieldLock,
  RoomDiff,
  RoomMeta,
  RoomSnapshot,
  ServerMessage,
} from 'common'
import { SyncSocket } from '@/sync/ws-client'
import type { SyncSocketStatus } from '@/sync/ws-client'
import {
  ackedFromContent,
  applyDiffToAcked,
  applyDiffToContent,
  buildDiff,
  contentFromAcked,
  contentFromSnapshot,
  contentOfTab,
  emptyAcked,
  stableStringify,
  TAB_FIELDS,
  TAB_SCALARS,
  UNKNOWN_CONTENT,
  UNKNOWN_SCALAR,
} from '@/sync/room-state'
import type { AckedState, RoomContent, TabField } from '@/sync/room-state'
import { describeClash, fingerprint } from '@/sync/offline-conflict'
import type { ConflictFactory } from '@/sync/offline-conflict'
import { diffChangesContent } from '@/sync/plan-activity'
import {
  pruneTabMirrorMeta,
  readTabMirrorMeta,
  removeTabMirrorMeta,
  setTabMirrorMeta,
} from '@/sync/tab-mirror-meta'
import { isCollaborative } from '@/sync/tab-sync-state'
import { useAppStore } from '@/stores/app-store'
import { useAuthStore } from '@/stores/auth-store'
import { useGameDataStore } from '@/stores/game-data-store'
import { calculateFactories } from '@/utils/factory-management/factory'
import eventBus from '@/utils/eventBus'

/** Trailing debounce on plan changes: one op per burst of edits, never one per keystroke. */
export const OP_DEBOUNCE_MS = 400
export const REVISION_PROBE_MS = 10_000

/**
 * Build-time only, and only ever set by the e2e harness: a compressed probe puts
 * several healing cycles inside a test-length run. A production bundle has no
 * such value, so this is the constant above.
 */
const probeIntervalMs = (): number => {
  const override = Number(import.meta.env.VITE_PROBE_MS)
  return Number.isFinite(override) && override > 0 ? override : REVISION_PROBE_MS
}

/** Failed reconnects before the "you appear to be offline" prompt. */
export const OFFLINE_PROMPT_AFTER = 3

/** How long the "offline mode is on" notice stays up. */
export const OFFLINE_NOTICE_MS = 10_000

/** Consecutive rejects before a room stops resending, so a refused op cannot hot-loop. */
export const REJECT_PAUSE_AFTER = 3

/** Keystrokes renew a field lock at most this often: a typist costs one frame per few seconds. */
export const FIELD_LOCK_RENEW_MS = 3_000

export type OfflineMode = 'online' | 'reconnecting' | 'offlinePrompt' | 'offline'

/**
 * `paused`: refused too many times running, so edits stay local until resumed.
 * `revoked`/`deleted`: access or the room itself is gone and the tab becomes a
 * local copy, content intact.
 */
export type RoomStatus = 'idle' | 'joining' | 'synced' | 'paused' | 'revoked' | 'deleted'

/** The reactive, display-sized half of a room. */
export interface RoomState {
  roomId: string
  status: RoomStatus
  revision: number
  presence: number
  meta: RoomMeta | null
  lastError: string | null
  rejectStreak: number
  hasPendingOp: boolean
}

interface PendingOp {
  opId: string
  baseRevision: number
  diff: RoomDiff
  /** The exact baseline this op becomes on ack. Never recomputed from live state. */
  sent: AckedState
}

/**
 * The engine half. Deliberately outside Vue's reactivity: it holds a serialized
 * copy of every factory, and a deep traversal of that on each reactive flush is
 * the known way to make large plans crawl.
 */
interface RoomEngine {
  acked: AckedState
  /** False until a snapshot, ack or apply has established a real baseline. */
  seeded: boolean
  /**
   * A provisional baseline read from the mirror. Enough to tell an offline add or
   * delete from an untouched record, never enough to base an op on.
   */
  primed: boolean
  pending: PendingOp | null
  touchedFactories: Set<number>
  touchedFields: Set<TabField>
  /**
   * Ids a deliberate user removal — a bulk replacement or a single delete — took out and
   * the server has not acknowledged yet. An op whose removals are all in here is sent as
   * `bulkRemoval`, which is the only way past the server's threshold; anything else that
   * shrinks the plan that far is refused.
   */
  declaredRemovals: Set<number>
  /**
   * Fingerprints of the baseline records for touched ids, read back from the mirror. The
   * baseline itself does not survive a restart, so this is what a reopened device compares
   * a snapshot against to tell a peer's edit from its own.
   */
  baselinePrints: Map<number, string>
  /** Fingerprints are only re-taken when the record they describe actually moves. */
  fingerprints: Map<number, { print: string, hash: string }>
  /**
   * Records this client put on the wire and never saw acked. A socket can die between the
   * write and the ack, so the snapshot that comes back may be carrying this client's own
   * edit — which is nobody else's change and must never be presented as one.
   */
  unacknowledged: Map<number, string>
  /** Something inbound was refused because the tab was mid-load; re-baseline when it ends. */
  needsSnapshot: boolean
  visitorToken?: string
}

/** One room's unanswered offline clash: the sections the dialog is asking about. */
export interface RoomConflict {
  roomId: string
  factories: ConflictFactory[]
}

/** Which version of a clashing factory the user picked. */
export type ConflictWinner = 'mine' | 'live'

export interface ResolveConflictOptions {
  /** Factories the live plan wins: this client gives up its claim on exactly these. */
  liveWinners?: number[]
  /** Keep this device's whole version of the plan as a separate local tab. */
  keepCopy?: boolean
}

/** One lock this client holds, and the timer that gives it up on the server's own line. */
interface HeldFieldLock {
  roomId: string
  fieldKey: string
  lastSentAt: number
  idleTimer: ReturnType<typeof setTimeout>
}

export interface TrackRoomOptions {
  /** Re-sent on every join of that room; a visitor has no other credential. */
  visitorToken?: string
}

export interface ConfigureOptions {
  socket?: SyncSocket
}

const newRoomState = (roomId: string): RoomState => ({
  roomId,
  status: 'idle',
  revision: 0,
  presence: 0,
  meta: null,
  lastError: null,
  rejectStreak: 0,
  hasPendingOp: false,
})

const newEngine = (options: TrackRoomOptions): RoomEngine => ({
  acked: emptyAcked(),
  seeded: false,
  primed: false,
  pending: null,
  touchedFactories: new Set(),
  touchedFields: new Set(),
  declaredRemovals: new Set(),
  baselinePrints: new Map(),
  fingerprints: new Map(),
  unacknowledged: new Map(),
  needsSnapshot: false,
  visitorToken: options.visitorToken,
})

export const useRoomSyncStore = defineStore('roomSync', () => {
  const appStore = useAppStore()
  const gameDataStore = useGameDataStore()

  const rooms = ref<Record<string, RoomState>>({})
  const mode = ref<OfflineMode>('online')
  const connection = ref<SyncSocketStatus>('idle')
  const failedReconnects = ref(0)
  const userId = ref<string | null>(null)
  const roomsRevision = ref<number | null>(null)
  /** A `rooms_changed` landed: the tab list wants refetching. */
  const roomsListStale = ref(false)
  const lastError = ref<string | null>(null)
  /** This socket's own id, as `hello_ok` handed it over. A lock's holder is one of these. */
  const connectionId = ref<string | null>(null)
  /** Who is editing what, per room: `roomId -> fieldKey -> holder`. */
  const fieldLocks = ref<Record<string, Record<string, string>>>({})
  /**
   * Rooms waiting on the offline conflict prompt. A room in here holds its ops until the
   * user has said which version of each clashing factory wins.
   */
  const conflicts = ref<Record<string, RoomConflict>>({})

  /** No socket, no REST, no retries. Preferences and adoption gate on this too. */
  const isOffline = computed(() => mode.value === 'offline')
  const isSuppressed = computed(() => mode.value === 'offline')
  const isConnected = computed(() => connection.value === 'connected')

  const engines = new Map<string, RoomEngine>()
  /** The locks this client holds, room and field together, outside reactivity. */
  const heldLocks = new Map<string, HeldFieldLock>()

  let socket: SyncSocket | null = null
  let unsubscribeMessage: (() => void) | null = null
  let unsubscribeStatus: (() => void) | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  /** Guards the post-4403 reconnect against looping when nothing was actually dropped. */
  let revokedSinceConnect = false

  const getTab = (roomId: string): FactoryTab | undefined => appStore.getTab(roomId)

  /**
   * The room's name belongs to its owner: the server refuses a member's op *whole*
   * if it carries one, so a drifted local name would pause the room rather than
   * rename it. Reading the name back off the baseline keeps it out of every diff.
   */
  const ownsRoom = (roomId: string): boolean => appStore.getTabState(roomId).role === 'owner'

  const localContentOf = (roomId: string, tab: FactoryTab, acked: AckedState): RoomContent => {
    const local = contentOfTab(tab)
    if (!ownsRoom(roomId)) local.name = acked.name
    return local
  }

  /**
   * A loading tab is read-only to the engine. The chain empties the factory array and
   * refills it one record at a time, so mid-chain it is a fragment of the plan: merging
   * a peer's diff into it, overlaying intent onto it, or seeding a baseline from it all
   * write the truncation back and then report it as the user deleting the plan.
   */
  const roomIsMidLoad = (roomId: string): boolean => appStore.isTabLoading(roomId)

  /**
   * Park an inbound message rather than applying it to a fragment. Nothing is lost: the
   * room is re-baselined from a fresh snapshot the moment the load finishes.
   */
  const parkWhileLoading = (roomId: string): boolean => {
    if (!roomIsMidLoad(roomId)) return false
    const engine = engines.get(roomId)
    if (engine) engine.needsSnapshot = true
    return true
  }

  /** Ask for a full snapshot, and only forget the need once the frame is actually away. */
  const healFromSnapshot = (roomId: string) => {
    const engine = engines.get(roomId)
    if (!engine?.needsSnapshot) return
    if (requestSnapshot(roomId)) engine.needsSnapshot = false
  }

  // ===== Intent =====

  const markUserTouched = (roomId: string, factoryId: number) => {
    const engine = engines.get(roomId)
    if (!engine || engine.touchedFactories.has(factoryId)) return
    engine.touchedFactories.add(factoryId)
    persistMeta(roomId)
  }

  const markTabTouched = (roomId: string, field: TabField) => {
    const engine = engines.get(roomId)
    if (!engine || engine.touchedFields.has(field)) return
    engine.touchedFields.add(field)
    persistMeta(roomId)
  }

  const hasLocalEdits = (roomId: string): boolean => {
    const engine = engines.get(roomId)
    if (!engine) return false
    return engine.pending !== null || engine.touchedFactories.size > 0 || engine.touchedFields.size > 0
  }

  // A local `undefined` never counts as a difference: the diff has no way to clear a tab
  // field, so claiming one differs would leave intent nothing could ever satisfy.
  const fieldDiffers = (acked: AckedState, local: RoomContent, field: TabField): boolean => {
    if (field === 'groups') return stableStringify(local.groups) !== acked.groups
    const value = local[field]
    return value !== undefined && value !== acked[field]
  }

  /**
   * Adds and deletes are always intent — nothing in the recalculation creates or
   * removes a factory, so the diff itself is the signal and no UI has to say so.
   * Tab-level fields are intent by the same argument.
   */
  const markStructuralIntent = (engine: RoomEngine, local: RoomContent) => {
    const localIds = new Set(local.factories.map(factory => factory.id))
    for (const id of localIds) {
      if (!engine.acked.factories.has(id)) engine.touchedFactories.add(id)
    }
    for (const id of engine.acked.factories.keys()) {
      if (!localIds.has(id)) engine.touchedFactories.add(id)
    }
    for (const field of TAB_FIELDS) {
      if (fieldDiffers(engine.acked, local, field)) engine.touchedFields.add(field)
    }
  }

  /** Everything an ack (or an adopted baseline) proved is no longer unsent intent. */
  const clearSatisfiedIntent = (roomId: string, baseline: AckedState) => {
    const engine = engines.get(roomId)
    const tab = getTab(roomId)
    if (!engine || !tab) return

    const local = localContentOf(roomId, tab, baseline)
    const localById = new Map(local.factories.map(factory => [factory.id, factory]))

    for (const id of [...engine.touchedFactories]) {
      const mine = localById.get(id)
      const current = mine ? stableStringify(mine) : undefined
      if (current === baseline.factories.get(id)) engine.touchedFactories.delete(id)
    }
    for (const field of [...engine.touchedFields]) {
      if (!fieldDiffers(baseline, local, field)) engine.touchedFields.delete(field)
    }
    // A record the baseline no longer holds can never be removed again, so its declaration
    // is spent. One that survived the rebase keeps it: the removal is still owed.
    for (const id of [...engine.declaredRemovals]) {
      if (!baseline.factories.has(id)) engine.declaredRemovals.delete(id)
    }
  }

  /**
   * Give up this client's claim on named records, so the next overlay takes the server's
   * copy of each. Intent is the only thing a rebase reads, and a declaration outliving the
   * removal it was for would launder the next accidental one — so both go.
   */
  const releaseIntentFor = (engine: RoomEngine, factoryIds: number[]) => {
    for (const id of factoryIds) {
      engine.touchedFactories.delete(id)
      engine.declaredRemovals.delete(id)
    }
  }

  // ===== Persistence =====

  /**
   * The baseline record's fingerprint, from the live baseline where there is one and from
   * the mirror where a restart left none. Cached against the print itself, because a bulk
   * edit can touch hundreds of records and every persist would otherwise re-hash them all.
   */
  const baselineFingerprint = (engine: RoomEngine, factoryId: number): string | undefined => {
    const print = engine.acked.factories.get(factoryId)
    if (print === undefined || print === UNKNOWN_CONTENT) return engine.baselinePrints.get(factoryId)

    const cached = engine.fingerprints.get(factoryId)
    if (cached?.print === print) return cached.hash

    const hash = fingerprint(print)
    engine.fingerprints.set(factoryId, { print, hash })
    return hash
  }

  const persistMeta = (roomId: string) => {
    const engine = engines.get(roomId)
    if (!engine) return

    const baselinePrints: Record<string, string> = {}
    for (const id of engine.touchedFactories) {
      const print = baselineFingerprint(engine, id)
      if (print !== undefined) baselinePrints[id] = print
    }

    setTabMirrorMeta(roomId, {
      revision: engine.acked.revision,
      appVersion: PROTOCOL_VERSION,
      userTouchedIds: [...engine.touchedFactories],
      userTouchedFields: [...engine.touchedFields],
      declaredRemovals: [...engine.declaredRemovals],
      baselinePrints,
    })
  }

  const pruneMirrorMeta = () => {
    pruneTabMirrorMeta(appStore.getTabs().map(tab => tab.id))
  }

  // ===== Op builder =====

  /**
   * Intent has to be recorded even when nothing can be sent. An add or delete made
   * offline (or between a drop and the reconnect) is invisible to the rebase
   * otherwise: the overlay would drop the new factory and resurrect the deleted one.
   */
  const recordIntent = (roomId: string) => {
    const engine = engines.get(roomId)
    const room = rooms.value[roomId]
    if (!engine || !room || room.status === 'revoked' || room.status === 'deleted') return
    // Mid-load the mirror is a half-filled array; comparing against it would read
    // as "the user deleted everything". Both flags, because the corruption this
    // guards against is exactly a chain that ran without lowering `isLoaded`.
    if (!appStore.isLoaded || roomIsMidLoad(roomId)) return

    primeBaseline(roomId)
    if (!engine.seeded && !engine.primed) return

    const tab = getTab(roomId)
    if (!tab) return

    const before = engine.touchedFactories.size + engine.touchedFields.size
    markStructuralIntent(engine, localContentOf(roomId, tab, engine.acked))
    if (engine.touchedFactories.size + engine.touchedFields.size !== before) persistMeta(roomId)
  }

  /**
   * The wire's last word on deletions. Nothing but a user action removes a factory, and
   * no user action is possible against a card that has not mounted — so a record the
   * baseline holds and a loading tab does not is a truncation, never a deletion. Refuse
   * the op and re-baseline instead of telling every other client the plan is gone.
   *
   * Deliberately independent of `isLoaded`, the flag that failed: a chain that forgets to
   * lower it still cannot get a removal onto the wire. Checked before the structural
   * inference too, which would otherwise record the truncation as the user's own intent
   * and persist it, carrying it across restarts.
   */
  const removalsAreTrustworthy = (roomId: string, engine: RoomEngine, local: RoomContent): boolean => {
    if (!roomIsMidLoad(roomId)) return true

    const mounted = new Set(local.factories.map(factory => factory.id))
    const missing = [...engine.acked.factories.keys()].filter(id => !mounted.has(id))
    if (missing.length === 0) return true

    console.error(
      'roomSyncStore: refusing to send factory removals nobody asked for, taking a fresh snapshot instead',
      { roomId, factoryIds: missing },
    )
    engine.needsSnapshot = true
    healFromSnapshot(roomId)
    return false
  }

  /**
   * Whether this op may claim `bulkRemoval`. Every removed id has to have been declared by a
   * deliberate user removal, so a diff that shrank for any other reason cannot borrow the
   * claim from one that did — which is what keeps the server's threshold worth having.
   */
  const declaresEveryRemoval = (engine: RoomEngine, diff: RoomDiff): boolean => {
    const removed = diff.removedFactoryIds ?? []
    return removed.length > 0 && removed.every(id => engine.declaredRemovals.has(id))
  }

  const flushRoom = (roomId: string): boolean => {
    const room = rooms.value[roomId]
    const engine = engines.get(roomId)
    if (!room || !engine) return false
    if (isSuppressed.value || room.status !== 'synced' || engine.pending) return false
    // Mid-load the mirror is a half-filled array, and a diff built from it would
    // read as "delete everything". The load's completion re-schedules the flush.
    if (!appStore.isLoaded) return false
    // An unanswered clash: what this op should carry is the question on screen, and
    // sending our version first would answer it for the user. An answer parked behind a
    // load chain holds it for the same reason: it is not on the plan yet.
    if (conflicts.value[roomId] || parkedResolutions.has(roomId)) return false

    const tab = getTab(roomId)
    if (!tab) return false

    const local = localContentOf(roomId, tab, engine.acked)
    if (!removalsAreTrustworthy(roomId, engine, local)) return false
    markStructuralIntent(engine, local)

    const result = buildDiff(engine.acked, local)
    if (!result) return false

    const opId = crypto.randomUUID()
    const sent = ensureSocket().sendOp({
      roomId,
      opId,
      baseRevision: engine.acked.revision,
      diff: result.diff,
      bulkRemoval: declaresEveryRemoval(engine, result.diff) || undefined,
    })
    if (!sent) return false

    // Send clears nothing: the baseline only moves when the server acks it.
    engine.pending = { opId, baseRevision: engine.acked.revision, diff: result.diff, sent: result.sent }
    room.hasPendingOp = true
    persistMeta(roomId)
    return true
  }

  const flushAll = () => {
    for (const roomId of Object.keys(rooms.value)) {
      applyParkedResolution(roomId)
      recordIntent(roomId)
      flushRoom(roomId)
    }
  }

  const scheduleFlush = () => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(flushAll, OP_DEBOUNCE_MS)
  }

  // ===== The one rebase path =====

  interface Overlay {
    content: RoomContent
    /** False when local state was already the server's, so no recalculation is owed. */
    overlaid: boolean
  }

  const overlayIntent = (engine: RoomEngine, server: RoomContent, tab: FactoryTab): Overlay => {
    const local = contentOfTab(tab)
    const localById = new Map(local.factories.map(factory => [factory.id, factory]))
    const serverPrints = engine.acked.factories
    let overlaid = false

    const factories: Factory[] = []
    for (const factory of server.factories) {
      if (!engine.touchedFactories.has(factory.id)) {
        factories.push(factory)
        continue
      }
      const mine = localById.get(factory.id)
      if (!mine) {
        // Touched and gone from local state: this client deleted it.
        overlaid = true
        continue
      }
      const serialized = stableStringify(mine)
      if (serialized !== serverPrints.get(factory.id)) overlaid = true
      factories.push(JSON.parse(serialized) as Factory)
    }

    // Touched records the server has never seen: created here since the baseline.
    for (const factory of local.factories) {
      if (serverPrints.has(factory.id) || !engine.touchedFactories.has(factory.id)) continue
      overlaid = true
      factories.push(JSON.parse(stableStringify(factory)) as Factory)
    }

    for (const field of TAB_FIELDS) {
      if (engine.touchedFields.has(field) && fieldDiffers(engine.acked, local, field)) overlaid = true
    }

    // Touched wins, but only where this client actually holds a value: an untouched or
    // absent scalar takes the server's, which is what keeps a tab that has never set a
    // depot tier from wiping the one a peer set.
    const content: RoomContent = { ...server, factories }
    for (const field of TAB_SCALARS) {
      const value = local[field]
      if (engine.touchedFields.has(field) && value !== undefined) {
        Object.assign(content, { [field]: value })
      }
    }
    if (engine.touchedFields.has('groups')) content.groups = local.groups

    return { content, overlaid }
  }

  const recalculate = (tab: FactoryTab) => {
    const data = gameDataStore.getGameData()
    if (!data) {
      console.error('roomSyncStore: recalculate: no game data, leaving the plan as adopted')
      return
    }
    // Building groups stay sacrosanct, exactly as a plan load treats them.
    calculateFactories(tab.factories, data, { origin: 'recalculate' })
  }

  /**
   * The array's order is the render order and `displayOrder` is the index into it
   * (see factory-groups.ts). A diff is replace-by-id, so a peer's reorder arrives
   * as new indexes on records this client already holds and nothing else would
   * move them: the plan's data changed and the screen did not. Stable, so records
   * sharing an index keep the order they arrived in.
   */
  const inDisplayOrder = (factories: Factory[]): Factory[] =>
    [...factories].sort((left, right) => (left.displayOrder ?? 0) - (right.displayOrder ?? 0))

  /**
   * The room is the authoritative copy, so an absent field is written as absent — the same rule
   * `name`, `powerTarget` and `groups` already follow. Keeping a local value the room does not
   * have is what would be wrong: `addTab` stamps a brand-new empty tab as answered-for, and the
   * tab created to join someone else's room is exactly that, so a preserved stamp would be sent
   * on this client's next op and silence the raw-resources notice for a room whose owner has
   * never been asked. Erring the other way only shows a notice that may not be needed.
   */
  const writeContentToTab = (tab: FactoryTab, content: RoomContent) => {
    tab.name = content.name
    tab.powerTarget = content.powerTarget
    tab.depotUploadTier = content.depotUploadTier
    tab.depotExpansionTier = content.depotExpansionTier
    tab.plannerVersion = content.plannerVersion
    tab.groups = content.groups

    const next = inDisplayOrder(content.factories)
    tab.factories = next
    // Belt and braces: every inbound path now parks rather than writing into a tab a
    // load chain owns, so this should be unreachable. If it is ever reached, queueing the
    // room's content as the next load lands it after the chain instead of under it — and
    // only for the tab on screen, since that is the one a queued load would commit to. A
    // copy, because a staggered chain is still pushing into the array it holds.
    if (appStore.isTabLoading(tab.id) && appStore.getCurrentTab()?.id === tab.id) {
      void appStore.prepareLoader([...next])
    }
  }

  /**
   * Adopt server state, overlay user-touched records from live local state,
   * recalculate, then send whatever still differs — or nothing. Every recovery
   * runs through here: reject, reconnect snapshot, inbound over a pending op,
   * offline exit and disconnect-before-apply.
   *
   * Returns whether it recalculated, which is the only thing a caller needs the
   * loader for.
   */
  const rebase = (roomId: string, server: RoomContent, revision: number, send = true): boolean => {
    const room = rooms.value[roomId]
    const engine = engines.get(roomId)
    if (!room || !engine) return false

    engine.acked = ackedFromContent(server, revision)
    engine.seeded = true
    engine.pending = null
    // Whatever the drop left in doubt, this snapshot has just settled.
    engine.unacknowledged.clear()
    room.hasPendingOp = false
    room.revision = revision
    if (room.status !== 'paused') room.status = 'synced'

    let recalculated = false
    const tab = getTab(roomId)
    if (tab) {
      const overlaid = overlayIntent(engine, server, tab)
      writeContentToTab(tab, overlaid.content)
      recalculated = overlaid.overlaid
      if (recalculated) recalculate(tab)
      appStore.schedulePersist()
      // Whatever the overlay left identical to the adopted state is not divergence.
      clearSatisfiedIntent(roomId, engine.acked)
    }

    persistMeta(roomId)
    // The prompt is about the newest server content, so a room already asking has to be
    // re-measured here: an op or a second snapshot may have settled the question.
    if (conflicts.value[roomId]) refreshConflict(roomId, server)
    if (send) flushRoom(roomId)
    return recalculated
  }

  // ===== The offline conflict prompt =====

  /**
   * Did somebody else change this record since the baseline this client agreed on. The
   * baseline print answers it outright; after a restart there is none, and the mirror's
   * fingerprint is all there is. No fingerprint means no answer, and no answer is silence.
   */
  const changedRemotely = (engine: RoomEngine, factoryId: number, live: Factory | null): boolean => {
    const baseline = engine.acked.factories.get(factoryId)
    if (baseline === undefined) return false
    if (live === null) return true
    // Our own op, landing after the socket that carried it died.
    if (engine.unacknowledged.get(factoryId) === stableStringify(live)) return false
    if (baseline !== UNKNOWN_CONTENT) return stableStringify(live) !== baseline

    const kept = engine.baselinePrints.get(factoryId)
    return kept !== undefined && fingerprint(stableStringify(live)) !== kept
  }

  /**
   * The clash this prompt exists for: a fresh snapshot carrying a room that moved past our
   * baseline, holding records we edited here and somebody else edited too. Deliberately
   * only from a snapshot — a reject during live editing is the routine 400ms race, which
   * the field locks and last-write-wins already cover.
   */
  const findClashes = (roomId: string, server: RoomContent, revision: number): ConflictFactory[] => {
    const engine = engines.get(roomId)
    const tab = getTab(roomId)
    if (!engine || !tab) return []
    if (!engine.seeded && !engine.primed) return []
    if (revision <= engine.acked.revision || engine.touchedFactories.size === 0) return []

    const serverById = new Map(server.factories.map(factory => [factory.id, factory]))
    const localById = new Map(contentOfTab(tab).factories.map(factory => [factory.id, factory]))

    const clashes: ConflictFactory[] = []
    for (const id of engine.touchedFactories) {
      const live = serverById.get(id) ?? null
      if (!changedRemotely(engine, id, live)) continue
      const clash = describeClash(id, live, localById.get(id) ?? null)
      if (clash) clashes.push(clash)
    }
    return clashes
  }

  /** Opens the prompt, or adds newly clashing records to one already asking. */
  const noteClashes = (roomId: string, server: RoomContent, revision: number) => {
    const fresh = findClashes(roomId, server, revision)
    const open = conflicts.value[roomId]

    if (!open) {
      if (fresh.length > 0) conflicts.value[roomId] = { roomId, factories: fresh }
      return
    }

    const known = new Set(open.factories.map(row => row.factoryId))
    open.factories = [...open.factories, ...fresh.filter(row => !known.has(row.factoryId))]
  }

  /**
   * Re-measures an open prompt against the newest server content, so nobody is asked
   * about figures that have moved on. A row whose two versions now agree, or whose intent
   * is spent, has nothing left to decide; with none left the dialog closes unprompted.
   */
  const refreshConflict = (roomId: string, server: RoomContent) => {
    const conflict = conflicts.value[roomId]
    const engine = engines.get(roomId)
    const tab = getTab(roomId)
    if (!conflict || !engine || !tab) return

    const serverById = new Map(server.factories.map(factory => [factory.id, factory]))
    const localById = new Map(contentOfTab(tab).factories.map(factory => [factory.id, factory]))

    const rows = conflict.factories
      .filter(row => engine.touchedFactories.has(row.factoryId))
      .map(row => describeClash(
        row.factoryId,
        serverById.get(row.factoryId) ?? null,
        localById.get(row.factoryId) ?? null,
      ))
      .filter((row): row is ConflictFactory => row !== null)

    if (rows.length === 0) delete conflicts.value[roomId]
    else conflict.factories = rows
  }

  /** Puts the server's copy of each named record back into the tab, absence included. */
  const takeServerCopies = (tab: FactoryTab, engine: RoomEngine, factoryIds: number[]) => {
    const wanted = new Set(factoryIds)
    const kept = tab.factories.filter(factory => !wanted.has(factory.id))

    for (const id of factoryIds) {
      const print = engine.acked.factories.get(id)
      if (print !== undefined && print !== UNKNOWN_CONTENT) kept.push(JSON.parse(print) as Factory)
    }
    tab.factories = inDisplayOrder(kept)
  }

  /**
   * This device's plan, kept whatever the user picks. A plain local tab: never tracked,
   * never activated, and carrying the tab-level fields too, since what is being kept is
   * the plan rather than its factories alone.
   */
  const keepOfflineCopy = (tab: FactoryTab): string => {
    const content = contentOfTab(tab)
    const copy = JSON.parse(JSON.stringify(content)) as RoomContent

    return appStore.addTab({
      name: `${tab.name} (offline copy)`,
      factories: copy.factories,
      powerTarget: copy.powerTarget,
      groups: copy.groups,
      depotUploadTier: copy.depotUploadTier,
      depotExpansionTier: copy.depotExpansionTier,
      plannerVersion: copy.plannerVersion,
    }, { activate: false })
  }

  /** Answers given while a load chain owned the plan, applied when it hands it back. */
  const parkedResolutions = new Map<string, ResolveConflictOptions>()

  /**
   * The user's answer. Mine-winners keep the intent they already have, so they leave exactly
   * as they always would; live-winners give theirs up and take the server's copy back, which
   * is the same convergence a refused bulk removal runs.
   *
   * The rebase that raised the question hands the plan to the loader, so an answer can land
   * while a chain owns the factory array. Writing into it then would be half-overwritten and
   * then committed, so the answer parks — taken either way, applied when the chain is done.
   */
  const resolveConflict = (
    roomId: string,
    { liveWinners = [], keepCopy = false }: ResolveConflictOptions = {},
  ): boolean => {
    const conflict = conflicts.value[roomId]
    if (!conflict) return false

    const asked = new Set(conflict.factories.map(row => row.factoryId))
    const answer = { liveWinners: liveWinners.filter(id => asked.has(id)), keepCopy }
    delete conflicts.value[roomId]

    if (roomIsMidLoad(roomId) || !appStore.isLoaded) {
      parkedResolutions.set(roomId, answer)
      return true
    }
    return applyResolution(roomId, answer)
  }

  const applyResolution = (
    roomId: string,
    { liveWinners = [], keepCopy = false }: ResolveConflictOptions,
  ): boolean => {
    const engine = engines.get(roomId)
    const tab = getTab(roomId)
    if (!engine || !tab) return false

    if (keepCopy) keepOfflineCopy(tab)

    if (liveWinners.length > 0) {
      releaseIntentFor(engine, liveWinners)
      takeServerCopies(tab, engine, liveWinners)
      recalculate(tab)
      appStore.schedulePersist()
      clearSatisfiedIntent(roomId, engine.acked)
      // A whole-plan replacement the user asked for takes the loader, as any other does.
      void appStore.reloadTabFromMirror(roomId)
    }

    persistMeta(roomId)
    flushRoom(roomId)
    return true
  }

  /** Retried rather than scheduled: a queued load can own the plan again a tick later. */
  const applyParkedResolution = (roomId: string) => {
    const parked = parkedResolutions.get(roomId)
    if (!parked || !appStore.isLoaded || roomIsMidLoad(roomId)) return

    parkedResolutions.delete(roomId)
    applyResolution(roomId, parked)
  }

  // ===== Reducer =====

  const handleMessage = (message: ServerMessage) => {
    switch (message.type) {
      case 'hello_ok':
        userId.value = message.userId
        roomsRevision.value = message.roomsRevision
        connectionId.value = message.connectionId
        // The transport holds no room state, so re-joining is ours to do.
        for (const room of liveRooms()) join(room.roomId)
        break

      case 'snapshot':
        onSnapshot(message.roomId, message.room, message.revision)
        break

      case 'up_to_date':
        onUpToDate(message.roomId, message.revision)
        break

      case 'op_ack':
        onOpAck(message.roomId, message.opId, message.revision)
        break

      case 'op_apply':
        onOpApply(message.roomId, message.diff, message.revision)
        break

      case 'op_reject':
        onOpReject(message.roomId, message.opId, message.reason, message.snapshot)
        break

      case 'room_meta':
        onRoomMeta(message.roomId, message.meta)
        break

      case 'room_deleted':
        markRoomGone(message.roomId, 'deleted')
        break

      case 'rooms_changed':
        roomsRevision.value = message.roomsRevision
        roomsListStale.value = true
        break

      case 'presence': {
        const room = rooms.value[message.roomId]
        if (room) room.presence = message.count
        break
      }

      // The whole truth about the room, every time: replacing the map is the apply.
      case 'field_locks': {
        const room = rooms.value[message.roomId]
        if (room) fieldLocks.value[message.roomId] = holdersOf(message.locks)
        break
      }

      case 'error': {
        const room = message.roomId ? rooms.value[message.roomId] : undefined
        if (room) room.lastError = message.code
        else lastError.value = message.code
        // The gateway announces the revocation and then closes the whole socket
        // 4403, so the room it names has to be dropped before the reconnect.
        if (message.code === 'forbidden' && message.roomId && room) {
          revokedSinceConnect = true
          markRoomGone(message.roomId, 'revoked')
        }
        break
      }
    }
  }

  const onSnapshot = (roomId: string, snapshot: RoomSnapshot, revision: number) => {
    if (!rooms.value[roomId]) return
    // Parking wins: the check needs a whole plan to compare against, and the fresh
    // snapshot the load asks for on the way out runs it properly.
    if (parkWhileLoading(roomId)) return

    const server = contentFromSnapshot(snapshot)
    // Before the rebase, which replaces both halves of the comparison: the baseline this
    // client agreed on, and the records it still holds.
    noteClashes(roomId, server, revision)
    const recalculated = rebase(roomId, server, revision)
    // Only a snapshot that recalculated needs the loader. The 10s revision probe answers
    // with a snapshot whenever it heals a missed op, and running the load funnel for those
    // blanked the planner and blocked flushing for the length of a chain, over and over.
    // The content is already written and persisted; a quiet apply is the whole difference.
    if (!recalculated) return
    // A whole-plan replace the user's own edits fought with. That takes the same
    // validation and loader path a plan load does rather than being written in behind it.
    void appStore.reloadTabFromMirror(roomId)
  }

  const onUpToDate = (roomId: string, revision: number) => {
    const room = rooms.value[roomId]
    const engine = engines.get(roomId)
    if (!room || !engine) return
    // The baseline this would seed comes off the tab, which is a fragment right now.
    if (parkWhileLoading(roomId)) return

    room.status = 'synced'
    room.revision = revision

    // Nothing changed server-side, so the mirror is the acked state — except for
    // whatever this client touched while it was away, which is unknown to us.
    if (!engine.seeded && !engine.primed) seedFromMirror(roomId, revision)
    engine.acked.revision = revision
    engine.seeded = true

    persistMeta(roomId)
    flushRoom(roomId)
  }

  /**
   * After a restart the baseline is gone but the mirror is not, and `up_to_date`
   * proves the mirror's revision is still the server's. Untouched records are
   * therefore the baseline; touched ones are marked unknown rather than claimed.
   */
  const seedFromMirror = (roomId: string, revision: number) => {
    const engine = engines.get(roomId)
    const tab = getTab(roomId)
    if (!engine || !tab) return

    engine.acked = ackedFromContent(contentOfTab(tab), revision)
    // Set even for ids the mirror no longer holds: a factory deleted while away is
    // only reported as removed if the baseline still carries it.
    for (const id of engine.touchedFactories) engine.acked.factories.set(id, UNKNOWN_CONTENT)
    for (const field of TAB_SCALARS) {
      if (!engine.touchedFields.has(field)) continue
      Object.assign(engine.acked, { [field]: UNKNOWN_SCALAR[field] })
    }
    if (engine.touchedFields.has('groups')) engine.acked.groups = UNKNOWN_CONTENT
  }

  /**
   * The same reconstruction, but provisional: taken at load time so intent can be
   * spotted before the socket ever answers. A snapshot replaces it outright.
   */
  const primeBaseline = (roomId: string) => {
    const engine = engines.get(roomId)
    if (!engine || engine.seeded || engine.primed) return

    const stored = readTabMirrorMeta()[roomId]
    if (!stored || !getTab(roomId)) return

    seedFromMirror(roomId, stored.revision)
    engine.primed = true
  }

  const onOpAck = (roomId: string, opId: string, revision: number) => {
    const room = rooms.value[roomId]
    const engine = engines.get(roomId)
    if (!room || !engine || engine.pending?.opId !== opId) return

    const sent = { ...engine.pending.sent, revision }
    engine.acked = sent
    engine.seeded = true
    engine.pending = null
    engine.unacknowledged.clear()
    room.hasPendingOp = false
    room.revision = revision
    room.rejectStreak = 0

    clearSatisfiedIntent(roomId, sent)
    persistMeta(roomId)
    // Edits made after the send are still unsent; they go out as the next op.
    flushRoom(roomId)
  }

  const onOpApply = (roomId: string, diff: RoomDiff, revision: number) => {
    const room = rooms.value[roomId]
    const engine = engines.get(roomId)
    if (!room || !engine) return

    // Merging into a fragment writes the fragment back, and the load then commits it.
    if (parkWhileLoading(roomId)) return

    // A primed baseline is a guess: there is nothing here a diff can legitimately
    // be applied onto until the server has answered a join.
    if (!engine.seeded) {
      requestSnapshot(roomId)
      return
    }

    // Read before the diff lands, while the tab still holds what it is being compared to.
    const tab = getTab(roomId)
    if (tab && diffChangesContent(diff, tab.factories)) {
      eventBus.emit('planContentApplied', { tabId: roomId })
    }

    if (!hasLocalEdits(roomId)) {
      applyRemote(roomId, diff, revision)
      return
    }

    // The diff carries whole records, so the server's new state is reconstructible
    // from the baseline — as long as this is the very next revision.
    const base = revision === engine.acked.revision + 1 ? contentFromAcked(engine.acked) : null
    if (base) rebase(roomId, applyDiffToContent(base, diff), revision)
    else requestSnapshot(roomId)
  }

  /** No local edits: replace by id and take the revision. No recalculation, by design. */
  const applyRemote = (roomId: string, diff: RoomDiff, revision: number) => {
    const room = rooms.value[roomId]
    const engine = engines.get(roomId)
    if (!room || !engine) return

    engine.acked = applyDiffToAcked(engine.acked, diff, revision)
    engine.seeded = true
    room.revision = revision

    const tab = getTab(roomId)
    if (tab) {
      writeContentToTab(tab, applyDiffToContent(contentOfTab(tab), diff))
      appStore.schedulePersist()
    }
    persistMeta(roomId)
  }

  const onOpReject = (
    roomId: string,
    opId: string,
    reason: string,
    snapshot: RoomSnapshot | undefined,
  ) => {
    const room = rooms.value[roomId]
    const engine = engines.get(roomId)
    if (!room || !engine) return
    if (engine.pending && engine.pending.opId !== opId) return

    const refusedRemovals = engine.pending?.diff.removedFactoryIds ?? []
    engine.pending = null
    room.hasPendingOp = false
    room.rejectStreak += 1
    room.lastError = reason

    // The server will not take these removals and this client has no way to make them
    // declarable, so a resend is a loop. Dropping the intent lets the rebase below put the
    // records back, which is the safe direction: the plan is on the server, not here.
    if (reason === 'undeclared_bulk_removal' && refusedRemovals.length > 0) {
      console.error(
        'roomSyncStore: the server refused removals nothing declared, restoring them from its copy',
        { roomId, factoryIds: refusedRemovals },
      )
      releaseIntentFor(engine, refusedRemovals)
    }

    if (!snapshot) {
      // Nothing to rebase onto: the room is gone or this client is no longer in it.
      markRoomGone(roomId, reason === 'room_deleted' ? 'deleted' : 'revoked')
      return
    }

    // Rebasing overlays local state onto the snapshot, and local state is a fragment.
    // The op is already dropped above, so parking here costs only the resend.
    if (parkWhileLoading(roomId)) return

    const paused = room.rejectStreak >= REJECT_PAUSE_AFTER
    rebase(roomId, contentFromSnapshot(snapshot), snapshot.revision, !paused)
    if (paused) room.status = 'paused'
  }

  /** Clears the pause a refused op caused; the next flush tries again. */
  const resumeRoom = (roomId: string) => {
    const room = rooms.value[roomId]
    if (!room || room.status !== 'paused') return
    room.status = 'synced'
    room.rejectStreak = 0
    flushRoom(roomId)
  }

  const onRoomMeta = (roomId: string, meta: RoomMeta) => {
    const room = rooms.value[roomId]
    const engine = engines.get(roomId)
    if (!room || !engine) return

    room.meta = meta
    // Meta changes carry no revision, so the baseline's name simply follows —
    // unless this client has an unsent rename of its own.
    if (engine.touchedFields.has('name')) return
    engine.acked.name = meta.name

    const tab = getTab(roomId)
    if (tab) {
      tab.name = meta.name
      appStore.schedulePersist()
    }
  }

  /** The tab keeps its content and quietly becomes a local copy. */
  const markRoomGone = (roomId: string, status: 'deleted' | 'revoked') => {
    const room = rooms.value[roomId]
    if (!room) return
    room.status = status
    room.hasPendingOp = false
    engines.delete(roomId)
    dropRoomLocks(roomId)
    delete conflicts.value[roomId]
    parkedResolutions.delete(roomId)
    removeTabMirrorMeta(roomId)
  }

  // ===== Connection =====

  /** Rooms still worth joining: the gone ones are on their way to being local tabs. */
  const liveRooms = (): RoomState[] =>
    Object.values(rooms.value).filter(room => room.status !== 'revoked' && room.status !== 'deleted')

  const handleStatus = (status: SyncSocketStatus) => {
    const wasConnected = connection.value === 'connected'
    connection.value = status

    if (status === 'connected') {
      failedReconnects.value = 0
      revokedSinceConnect = false
      if (mode.value !== 'offline') mode.value = 'online'
      return
    }

    // An unacknowledged op died with the socket. Dropping it is what makes the
    // reconnect a plain rebase rather than a second, duplicated send.
    if (wasConnected) {
      abandonPendingOps()
      forgetFieldLocks()
    }

    if (status === 'stopped') {
      onSocketStopped()
      return
    }

    if (mode.value === 'offline' || status !== 'reconnecting') return

    failedReconnects.value += 1
    if (mode.value !== 'offlinePrompt') mode.value = 'reconnecting'
    if (failedReconnects.value >= OFFLINE_PROMPT_AFTER || browserIsOffline()) mode.value = 'offlinePrompt'
  }

  /**
   * 4401 says the account token is dead, which is a sign-out. 4403 takes the whole
   * socket down for one room's revocation, so the rest reconnect without it.
   */
  const onSocketStopped = () => {
    const code = socket?.lastCloseCode ?? null

    if (code === CLOSE_CODES.unauthorized) {
      eventBus.emit('sessionExpired')
      return
    }
    if (code !== CLOSE_CODES.forbidden || !revokedSinceConnect) return

    revokedSinceConnect = false
    if (liveRooms().length > 0) start()
  }

  const abandonPendingOps = () => {
    for (const [roomId, engine] of engines) {
      // Sent, and its fate unknown: the reconnect's snapshot decides, and until then this
      // is what tells our own edit coming back from somebody else's.
      for (const factory of engine.pending?.diff.factories ?? []) {
        const print = engine.pending?.sent.factories.get(factory.id)
        if (print !== undefined) engine.unacknowledged.set(factory.id, print)
      }
      engine.pending = null
      const room = rooms.value[roomId]
      if (!room) continue
      room.hasPendingOp = false
      if (room.status === 'synced' || room.status === 'joining') room.status = 'idle'
    }
  }

  const browserIsOffline = (): boolean =>
    typeof navigator !== 'undefined' && navigator.onLine === false

  const onBrowserOffline = () => {
    if (mode.value === 'offline') return
    mode.value = 'offlinePrompt'
  }

  // ===== Wiring =====

  /** The socket is injectable so the engine's contract can be driven by hand. */
  const configure = (options: ConfigureOptions = {}) => {
    if (options.socket && options.socket !== socket) {
      unsubscribeMessage?.()
      unsubscribeStatus?.()
      socket = options.socket
      unsubscribeMessage = socket.onMessage(handleMessage)
      unsubscribeStatus = socket.onStatus(handleStatus)
    }
    return socket
  }

  const ensureSocket = (): SyncSocket => {
    if (!socket) configure({ socket: new SyncSocket() })
    return socket as SyncSocket
  }

  // ===== Lifecycle =====

  const start = () => {
    if (isSuppressed.value) return
    const token = useAuthStore().getToken()
    ensureSocket().connect(token || undefined)
  }

  const stop = () => {
    socket?.stop()
  }

  const trackRoom = (roomId: string, options: TrackRoomOptions = {}) => {
    if (!rooms.value[roomId]) rooms.value[roomId] = newRoomState(roomId)

    let engine = engines.get(roomId)
    if (!engine) {
      engine = newEngine(options)
      engines.set(roomId, engine)

      // Intent is the only thing that survives a restart; the baseline is not.
      const stored = readTabMirrorMeta()[roomId]
      for (const id of stored?.userTouchedIds ?? []) engine.touchedFactories.add(id)
      for (const field of stored?.userTouchedFields ?? []) engine.touchedFields.add(field)
      for (const id of stored?.declaredRemovals ?? []) engine.declaredRemovals.add(id)
      for (const [id, print] of Object.entries(stored?.baselinePrints ?? {})) {
        engine.baselinePrints.set(Number(id), print)
      }
    } else if (options.visitorToken) {
      engine.visitorToken = options.visitorToken
    }

    if (appStore.isLoaded && !roomIsMidLoad(roomId)) primeBaseline(roomId)
    if (isConnected.value) join(roomId)
  }

  const untrackRoom = (roomId: string) => {
    if (rooms.value[roomId]) socket?.leave(roomId)
    delete rooms.value[roomId]
    engines.delete(roomId)
    dropRoomLocks(roomId)
    // A question about a room this browser no longer holds has no answer worth taking.
    delete conflicts.value[roomId]
    parkedResolutions.delete(roomId)
    removeTabMirrorMeta(roomId)
  }

  const join = (roomId: string): boolean => {
    const room = rooms.value[roomId]
    const engine = engines.get(roomId)
    if (!room || !engine || isSuppressed.value) return false
    // Re-joining a room this client has just been kicked out of only gets it kicked again.
    if (room.status === 'revoked' || room.status === 'deleted') return false

    const stored = readTabMirrorMeta()[roomId]
    const lastRevision = engine.seeded ? engine.acked.revision : stored?.revision
    room.status = 'joining'
    return ensureSocket().join(roomId, { lastRevision, visitorToken: engine.visitorToken })
  }

  /** Forces a fresh snapshot: a join with no revision can never answer `up_to_date`. */
  const requestSnapshot = (roomId: string): boolean => {
    const engine = engines.get(roomId)
    if (!engine || isSuppressed.value) return false
    return ensureSocket().join(roomId, { visitorToken: engine.visitorToken })
  }

  /**
   * Post-commit broadcasts are deliberately best-effort, so a dropped op_apply
   * would otherwise leave this client stale forever. An idle re-join answers
   * up_to_date (two lines) or a healing snapshot; never fires mid-edit.
   */
  const probeRevision = (roomId: string): boolean => {
    const room = rooms.value[roomId]
    const engine = engines.get(roomId)
    if (!room || !engine || isSuppressed.value) return false
    if (!engine.seeded || room.status !== 'synced' || hasLocalEdits(roomId)) return false
    if (!socket || socket.status !== 'connected') return false
    return socket.join(roomId, { lastRevision: engine.acked.revision, visitorToken: engine.visitorToken })
  }

  const probeTick = () => {
    for (const roomId of Object.keys(rooms.value)) {
      // Nothing else would ask again if the flush the load scheduled was swallowed.
      applyParkedResolution(roomId)
      // A room parked mid-load whose snapshot request could not be sent — offline, or the
      // socket down — has nothing else that would ever ask again.
      if (engines.get(roomId)?.needsSnapshot) healFromSnapshot(roomId)
      // A paused room retries here or nowhere: no UI clears the pause, so refused ops
      // used to leave the tab receive-only until the page was reloaded, silently. The
      // probe interval is the rate limit the streak was protecting the server from.
      else if (rooms.value[roomId].status === 'paused') resumeRoom(roomId)
      else probeRevision(roomId)
    }
  }

  // ===== Field locks =====

  const heldKey = (roomId: string, fieldKey: string): string => `${roomId}\u0000${fieldKey}`

  const holdersOf = (locks: FieldLock[]): Record<string, string> =>
    Object.fromEntries(locks.map(lock => [lock.fieldKey, lock.holder]))

  /** Somebody else is in this field. Our own lock disables nothing on our own screen. */
  const lockedByOther = (roomId: string | null | undefined, fieldKey: string): boolean => {
    if (!roomId) return false
    const holder = fieldLocks.value[roomId]?.[fieldKey]
    return holder !== undefined && holder !== connectionId.value
  }

  /**
   * Locks are for rooms with other people in them: a local or private tab has
   * nobody to lock against and never sends a frame.
   */
  const canLock = (roomId: string): boolean => {
    if (isSuppressed.value || !isConnected.value) return false
    if (rooms.value[roomId]?.status !== 'synced') return false
    return isCollaborative(appStore.getTabState(roomId))
  }

  const sendFieldLock = (type: 'lock' | 'unlock', roomId: string, fieldKey: string): boolean =>
    ensureSocket().send({ type, roomId, fieldKey })

  /** Focus, and every reacquisition after an idle lapse. */
  const claimField = (roomId: string, fieldKey: string): boolean => {
    if (!canLock(roomId) || !sendFieldLock('lock', roomId, fieldKey)) return false

    const key = heldKey(roomId, fieldKey)
    clearTimeout(heldLocks.get(key)?.idleTimer)
    heldLocks.set(key, {
      roomId,
      fieldKey,
      lastSentAt: Date.now(),
      // The server drops a lock nobody renewed but only announces it on the sweep,
      // three heartbeats later. Giving ours up on the same line tells the room at 10s.
      idleTimer: setTimeout(() => releaseField(roomId, fieldKey), FIELD_LOCK_TTL_MS),
    })
    return true
  }

  /** A keystroke. Throttled, so holding a field down costs one frame every few seconds. */
  const renewField = (roomId: string, fieldKey: string): boolean => {
    const held = heldLocks.get(heldKey(roomId, fieldKey))
    if (held && Date.now() - held.lastSentAt < FIELD_LOCK_RENEW_MS) return false
    return claimField(roomId, fieldKey)
  }

  /** Blur. The broadcast that follows is what re-enables the field for everyone else. */
  const releaseField = (roomId: string, fieldKey: string): boolean => {
    const key = heldKey(roomId, fieldKey)
    const held = heldLocks.get(key)
    if (!held) return false

    clearTimeout(held.idleTimer)
    heldLocks.delete(key)
    return sendFieldLock('unlock', roomId, fieldKey)
  }

  const releaseAllFields = () => {
    for (const held of [...heldLocks.values()]) releaseField(held.roomId, held.fieldKey)
  }

  /**
   * A dropped socket released every lock server-side, and a re-join is told what a
   * room holds only when it holds something — so a display carried across the gap
   * would disable a field nobody is in, with no frame coming to correct it.
   */
  const forgetFieldLocks = () => {
    for (const held of heldLocks.values()) clearTimeout(held.idleTimer)
    heldLocks.clear()
    fieldLocks.value = {}
  }

  /** The room is going: no unlock worth sending, and nothing left to display. */
  const dropRoomLocks = (roomId: string) => {
    for (const [key, held] of [...heldLocks]) {
      if (held.roomId !== roomId) continue
      clearTimeout(held.idleTimer)
      heldLocks.delete(key)
    }
    delete fieldLocks.value[roomId]
  }

  // ===== Offline mode =====

  /** Airplane mode: total backend silence, not quieter retrying. */
  const enterOffline = () => {
    // Whatever was edited inside the last debounce window still has to be remembered.
    for (const roomId of Object.keys(rooms.value)) recordIntent(roomId)
    // While the socket is still up: nobody should be left staring at a field this
    // client walked away from.
    releaseAllFields()
    mode.value = 'offline'
    failedReconnects.value = 0
    clearTimeout(debounceTimer)
    socket?.stop()
    // The notice goes; the state does not. The tab bar's chip and the account
    // panel both say "Offline mode" for as long as it is on.
    eventBus.emit('toast', {
      message: 'Offline mode is on. Your edits are kept on this device and sent when you turn it off.',
      type: 'warning',
      variant: 'timed',
      timeout: OFFLINE_NOTICE_MS,
    })
  }

  const dismissOfflinePrompt = () => {
    if (mode.value !== 'offlinePrompt') return
    mode.value = 'reconnecting'
    failedReconnects.value = 0
  }

  /** Leaving is manual, like a phone. Each room rebases off its join snapshot. */
  const exitOffline = () => {
    if (mode.value !== 'offline') return
    mode.value = 'reconnecting'
    failedReconnects.value = 0
    start()
  }

  // ===== Event wiring =====

  /**
   * `factoryEdited` is the user's own action; `factoryUpdated` also fires for
   * every factory the recalculation rippled into, which is payload, not intent.
   */
  const onFactoryEdited = (factory: Factory) => {
    const tab = appStore.getCurrentTab()
    if (tab && engines.has(tab.id)) markUserTouched(tab.id, factory.id)
    scheduleFlush()
  }

  /**
   * The tab-level equivalent. `markStructuralIntent` would infer the same thing from the
   * diff, but only once something schedules a flush — a power target or a group list
   * changed on its own schedules nothing, so an inbound op arriving first replaces it.
   */
  const onTabEdited = (field: TabField) => {
    const tab = appStore.getCurrentTab()
    if (tab && engines.has(tab.id)) markTabTouched(tab.id, field)
    scheduleFlush()
  }

  /**
   * The user removed records — one delete, or a whole-plan replacement. Recorded per id and
   * persisted, because the op that carries these removals may be several minutes and a
   * restart away — offline, or behind a pending op — and undeclared it would be refused and
   * the plan handed back.
   */
  const onPlanReplaced = ({ removedIds }: { removedIds: number[] }) => {
    const tab = appStore.getCurrentTab()
    const engine = tab ? engines.get(tab.id) : undefined
    if (!tab || !engine || removedIds.length === 0) return

    for (const id of removedIds) engine.declaredRemovals.add(id)
    persistMeta(tab.id)
  }

  /**
   * The mirror is a whole plan again, so this is the flush the load blocked, the moment a
   * provisional baseline can be read off it, and the moment every message parked during
   * the chain is made good — a fresh snapshot rebases onto a complete array.
   */
  const onLoadingCompleted = () => {
    for (const roomId of Object.keys(rooms.value)) {
      primeBaseline(roomId)
      healFromSnapshot(roomId)
    }
    scheduleFlush()
  }

  // Switching away is a blur the field never gets: the card is gone before it fires,
  // and a lock nobody releases sits on the other screens until it lapses.
  const stopTabWatch = watch(() => appStore.getCurrentTab()?.id, () => releaseAllFields())

  eventBus.on('factoryEdited', onFactoryEdited)
  eventBus.on('tabEdited', onTabEdited)
  eventBus.on('planReplaced', onPlanReplaced)
  eventBus.on('factoryUpdated', scheduleFlush)
  eventBus.on('calculationsCompleted', scheduleFlush)
  eventBus.on('loadingCompleted', onLoadingCompleted)

  if (typeof window !== 'undefined') window.addEventListener('offline', onBrowserOffline)

  const probeTimer = setInterval(probeTick, probeIntervalMs())
  if (typeof probeTimer === 'object' && 'unref' in probeTimer) probeTimer.unref()

  const dispose = () => {
    clearInterval(probeTimer)
    stopTabWatch()
    forgetFieldLocks()
    eventBus.off('factoryEdited', onFactoryEdited)
    eventBus.off('tabEdited', onTabEdited)
    eventBus.off('planReplaced', onPlanReplaced)
    eventBus.off('factoryUpdated', scheduleFlush)
    eventBus.off('calculationsCompleted', scheduleFlush)
    eventBus.off('loadingCompleted', onLoadingCompleted)
    if (typeof window !== 'undefined') window.removeEventListener('offline', onBrowserOffline)
    clearTimeout(debounceTimer)
    unsubscribeMessage?.()
    unsubscribeStatus?.()
    unsubscribeMessage = null
    unsubscribeStatus = null
    socket = null
  }

  return {
    // State
    rooms,
    mode,
    connection,
    failedReconnects,
    userId,
    roomsRevision,
    roomsListStale,
    lastError,
    connectionId,
    fieldLocks,
    conflicts,
    isOffline,
    isSuppressed,
    isConnected,

    // Lifecycle
    configure,
    start,
    stop,
    dispose,
    trackRoom,
    untrackRoom,
    join,
    requestSnapshot,
    probeRevision,
    // One tick of the idle interval, which the interval itself makes unreachable to a spec.
    probeTick,

    // Intent and ops
    markUserTouched,
    markTabTouched,
    hasLocalEdits,
    recordIntent,
    flushRoom,
    flushAll,
    resumeRoom,

    // The offline conflict prompt
    resolveConflict,

    // Field locks
    lockedByOther,
    claimField,
    renewField,
    releaseField,
    releaseAllFields,

    // Offline
    enterOffline,
    dismissOfflinePrompt,
    exitOffline,

    // Persistence
    pruneMirrorMeta,

    // Reducer, driven by the socket and directly by tests
    handleMessage,
  }
})
