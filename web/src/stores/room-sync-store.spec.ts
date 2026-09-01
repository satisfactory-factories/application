import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { FIELD_LOCK_TTL_MS, PROTOCOL_VERSION } from 'common'
import type { Factory, FactoryTab, RoomSnapshot, ServerMessage } from 'common'
import { SyncSocket } from '@/sync/ws-client'
import type { WebSocketLike } from '@/sync/ws-client'
import {
  FIELD_LOCK_RENEW_MS,
  OFFLINE_NOTICE_MS,
  OP_DEBOUNCE_MS,
  REVISION_PROBE_MS,
  useRoomSyncStore,
} from '@/stores/room-sync-store'
import { useAppStore } from '@/stores/app-store'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addCustomBuildingToFactory } from '@/utils/factory-management/custom-buildings'
import { addProductToFactory } from '@/utils/factory-management/products'
import { getDisposal, setDepotCount, setSinkCount } from '@/utils/factory-management/disposal'
import { setChecklistEnabled, toggleChecklistProduct } from '@/utils/factory-management/checklist'
import { setSyncState } from '@/utils/factory-management/syncState'
import { gameData } from '@/utils/gameData'
import { mergeFactories, stableStringify } from '@/sync/room-state'
import { fingerprint } from '@/sync/offline-conflict'
import { readTabMirrorMeta, setTabMirrorMeta } from '@/sync/tab-mirror-meta'
import eventBus from '@/utils/eventBus'

const ROOM = 'room-1'
const SOCKET_OPEN = 1
const SOCKET_CLOSED = 3

/** A hand-driven socket: nothing happens until a test says it happens. */
class FakeSocket implements WebSocketLike {
  readyState = SOCKET_OPEN
  sent: string[] = []
  closedWith: { code?: number, reason?: string } | null = null

  onopen: ((event: unknown) => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: ((event: { code: number, reason?: string }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null

  constructor (readonly url: string) {}

  send (data: string): void {
    this.sent.push(data)
  }

  close (code?: number, reason?: string): void {
    this.closedWith = { code, reason }
    this.readyState = SOCKET_CLOSED
  }

  open (): void {
    this.onopen?.({})
  }

  receive (message: ServerMessage): void {
    this.onmessage?.({ data: JSON.stringify(message) })
  }

  serverClose (code: number): void {
    this.readyState = SOCKET_CLOSED
    this.onclose?.({ code })
  }

  get frames (): any[] {
    return this.sent.map(frame => JSON.parse(frame))
  }
}

/** As it would arrive off the wire: JSON, never a live object. */
const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const helloOk: ServerMessage = {
  type: 'hello_ok',
  protocolVersion: PROTOCOL_VERSION,
  userId: 'user-1',
  roomsRevision: 1,
  connectionId: 'conn-1',
}

describe('room-sync-store', () => {
  let appStore: ReturnType<typeof useAppStore>
  let store: ReturnType<typeof useRoomSyncStore>
  let sockets: FakeSocket[]
  let fixture: Factory[]

  const latest = () => sockets[sockets.length - 1]
  const receive = (message: ServerMessage) => latest().receive(message)
  const framesOf = (socket = latest()) => socket.frames
  const opsOf = (socket = latest()) => framesOf(socket).filter(frame => frame.type === 'op')
  const joinsOf = (socket = latest()) => framesOf(socket).filter(frame => frame.type === 'join')
  const lastOp = (socket = latest()) => opsOf(socket).at(-1)

  const connect = () => {
    store.start()
    latest().open()
    receive(helloOk)
  }

  const setTab = (factories: Factory[], overrides: Partial<FactoryTab> = {}): FactoryTab => {
    appStore.factoryTabs.splice(0, appStore.factoryTabs.length, {
      id: ROOM,
      name: 'Plan',
      factories,
      powerTarget: 0,
      groups: [],
      ...overrides,
    })
    return appStore.getTab(ROOM) as FactoryTab
  }

  const snapshotOf = (factories: Factory[], revision: number, overrides: Partial<RoomSnapshot> = {}): RoomSnapshot => ({
    roomId: ROOM,
    name: 'Plan',
    slug: null,
    shared: false,
    hasPassword: false,
    factories: wire(factories),
    powerTarget: 0,
    groups: [],
    revision,
    createdBy: 'user-1',
    ...overrides,
  })

  /** Track, connect and adopt a server snapshot: the room is live at `revision`. */
  const syncAt = (factories: Factory[], revision: number): FactoryTab => {
    const tab = setTab(wire(factories))
    store.trackRoom(ROOM)
    connect()
    receive({ type: 'snapshot', roomId: ROOM, room: snapshotOf(factories, revision), revision })
    return tab
  }

  const names = (tab: FactoryTab) => tab.factories.map(entry => entry.name)

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    appStore = useAppStore()
    // The engine refuses to send while a load is in flight, because a half-filled
    // mirror diffs as "delete everything". These specs are about a settled plan.
    appStore.isLoaded = true

    // Pre-calculated, so a rebase's recalculation is a no-op and the assertions
    // are about sync rather than about the calculation engine.
    fixture = [newFactory('Alpha', 0, 1), newFactory('Beta', 1, 2)]
    calculateFactories(fixture, gameData, { origin: 'recalculate' })
    fixture = wire(fixture)

    sockets = []
    store = useRoomSyncStore()
    store.configure({
      socket: new SyncSocket({
        url: 'ws://test.local/ws',
        socketFactory: url => {
          const socket = new FakeSocket(url)
          sockets.push(socket)
          return socket
        },
      }),
    })
  })

  afterEach(() => {
    store.dispose()
    vi.useRealTimers()
  })

  describe('joining', () => {
    it('re-joins every tracked room on the handshake, carrying the stored revision', () => {
      setTab(wire(fixture))
      setTabMirrorMeta(ROOM, {
        revision: 5,
        appVersion: PROTOCOL_VERSION,
        userTouchedIds: [],
        userTouchedFields: [],
        declaredRemovals: [],
      })

      store.trackRoom(ROOM, { visitorToken: 'visitor-1' })
      connect()

      expect(joinsOf()).toEqual([
        { type: 'join', roomId: ROOM, lastRevision: 5, visitorToken: 'visitor-1' },
      ])
    })

    it('adopts a snapshot into the tab and sends nothing back', () => {
      const tab = setTab([])
      store.trackRoom(ROOM)
      connect()

      receive({ type: 'snapshot', roomId: ROOM, room: snapshotOf(fixture, 4), revision: 4 })

      expect(names(tab)).toEqual(['Alpha', 'Beta'])
      expect(store.rooms[ROOM].status).toBe('synced')
      expect(store.rooms[ROOM].revision).toBe(4)
      expect(opsOf()).toHaveLength(0)
    })

    // The idle revision probe re-joins every 10 seconds and is answered with a snapshot
    // whenever it heals a missed op. Running the load funnel for those blanked the planner
    // and stopped the client sending, over and over, for a plan that never changed here.
    it('applies a snapshot quietly when there was nothing local to rebase over', () => {
      const emit = vi.spyOn(eventBus, 'emit')
      const reload = vi.spyOn(appStore, 'reloadTabFromMirror').mockResolvedValue()
      const tab = setTab([])
      store.trackRoom(ROOM)
      connect()

      receive({ type: 'snapshot', roomId: ROOM, room: snapshotOf(fixture, 4), revision: 4 })

      expect(names(tab)).toEqual(['Alpha', 'Beta'])
      expect(reload).not.toHaveBeenCalled()
      expect(emit).not.toHaveBeenCalledWith('plannerShow', false)
      emit.mockRestore()
    })

    it('sends a snapshot that fought with a local edit through the loader funnel', () => {
      const tab = syncAt(fixture, 4)
      const reload = vi.spyOn(appStore, 'reloadTabFromMirror').mockResolvedValue()
      tab.factories[0].name = 'Mine'
      store.markUserTouched(ROOM, 1)

      const server = wire(fixture)
      server[0].name = 'Theirs'
      receive({ type: 'snapshot', roomId: ROOM, room: snapshotOf(server, 5), revision: 5 })

      expect(names(tab)).toEqual(['Mine', 'Beta'])
      expect(reload).toHaveBeenCalledWith(ROOM)
    })

    /**
     * The load chain owns the plan array until it completes, so a snapshot landing
     * inside that window is parked rather than merged into a fragment. The heal is
     * a fresh snapshot request the moment the chain reports back, which then rebases
     * onto a complete array.
     */
    it('parks a snapshot that lands mid-load and heals from a fresh one', async () => {
      const tab = setTab([])
      appStore.currentFactoryTab = tab
      store.trackRoom(ROOM)
      connect()
      const joinsBefore = joinsOf().length

      // Parked on the chain's first pause, exactly where a tab switch waits.
      const loading = appStore.prepareLoader(tab.factories)
      receive({ type: 'snapshot', roomId: ROOM, room: snapshotOf(fixture, 4), revision: 4 })
      expect(names(tab), 'the parked snapshot was written into the tab anyway').toEqual([])

      await loading
      await vi.waitFor(() => {
        if (appStore.loadInFlight) throw new Error('the queued load is still running')
      })

      // A join with no revision: the server can only answer it with a whole snapshot.
      const heal = joinsOf().slice(joinsBefore).at(-1)
      expect(heal, 'the load ended without asking for a fresh snapshot').toBeDefined()
      expect(heal.lastRevision).toBeUndefined()

      receive({ type: 'snapshot', roomId: ROOM, room: snapshotOf(fixture, 4), revision: 4 })
      expect(names(tab)).toEqual(['Alpha', 'Beta'])

      // The load may re-normalise records and send them; what it must never do is
      // tell the server the room is empty.
      store.flushRoom(ROOM)
      expect(opsOf().flatMap(op => op.diff.removedFactoryIds ?? [])).toEqual([])
    })

    /**
     * The other half of the same rule: a snapshot the user's edits fought with is
     * handed back to the loader, and handing it the live array lets the chain that is
     * still staggering append its own copy of the plan onto the room's content.
     */
    it('does not duplicate the plan when a recalculating snapshot lands mid-stagger', async () => {
      const tab = syncAt(fixture, 4)
      appStore.currentFactoryTab = tab
      tab.factories[0].name = 'Mine'
      store.markUserTouched(ROOM, 1)

      // forceRecalc so the chain actually staggers; the first increment is proof it is.
      const loading = appStore.prepareLoader(tab.factories, true)
      await new Promise<void>(resolve => {
        const onIncrement = () => {
          eventBus.off('incrementLoad', onIncrement)
          resolve()
        }
        eventBus.on('incrementLoad', onIncrement)
      })

      const server = wire(fixture)
      server[0].name = 'Theirs'
      receive({ type: 'snapshot', roomId: ROOM, room: snapshotOf(server, 5), revision: 5 })

      await loading
      await vi.waitFor(() => {
        if (appStore.loadInFlight) throw new Error('the queued load is still running')
      })

      expect(names(tab)).toEqual(['Mine', 'Beta'])
    })

    it('never hides the planner for a snapshot into a tab nobody is looking at', async () => {
      const tab = syncAt(fixture, 4)
      appStore.factoryTabs.push({ id: 'other-tab', name: 'Other', factories: [], powerTarget: 0, groups: [] })
      appStore.currentFactoryTab = appStore.getTab('other-tab') as FactoryTab
      const emit = vi.spyOn(eventBus, 'emit')

      tab.factories[0].name = 'Mine'
      store.markUserTouched(ROOM, 1)
      const server = wire(fixture)
      server[0].name = 'Theirs'
      receive({ type: 'snapshot', roomId: ROOM, room: snapshotOf(server, 5), revision: 5 })
      await Promise.resolve()

      expect(names(tab)).toEqual(['Mine', 'Beta'])
      expect(emit).not.toHaveBeenCalledWith('plannerShow', false)
      emit.mockRestore()
    })

    it('does not send while a load is in flight, and flushes once it completes', () => {
      const tab = syncAt(fixture, 4)
      appStore.isLoaded = false
      tab.name = 'Renamed mid-load'

      store.flushRoom(ROOM)
      expect(opsOf()).toHaveLength(0)

      appStore.isLoaded = true
      store.flushRoom(ROOM)

      expect(lastOp().diff.name).toBe('Renamed mid-load')
    })

    it('marks the room current on up_to_date without touching the factories', () => {
      const tab = setTab(wire(fixture))
      setTabMirrorMeta(ROOM, {
        revision: 9,
        appVersion: PROTOCOL_VERSION,
        userTouchedIds: [],
        userTouchedFields: [],
        declaredRemovals: [],
      })
      store.trackRoom(ROOM)
      connect()
      const before = tab.factories

      receive({ type: 'up_to_date', roomId: ROOM, revision: 9 })

      expect(tab.factories).toBe(before)
      expect(store.rooms[ROOM].status).toBe('synced')
      expect(store.rooms[ROOM].revision).toBe(9)
      expect(opsOf()).toHaveLength(0)
    })

    it('sends the edits a restart left behind when up_to_date seeds from the mirror', () => {
      const tab = setTab(wire(fixture))
      tab.factories[0].name = 'Edited offline'
      // Only the intent survives a restart; the baseline it was acked against does not.
      setTabMirrorMeta(ROOM, {
        revision: 9,
        appVersion: PROTOCOL_VERSION,
        userTouchedIds: [1],
        userTouchedFields: [],
        declaredRemovals: [],
      })
      store.trackRoom(ROOM)
      connect()

      receive({ type: 'up_to_date', roomId: ROOM, revision: 9 })

      const op = lastOp()
      expect(op.baseRevision).toBe(9)
      expect(op.diff.factories.map((entry: Factory) => entry.name)).toEqual(['Edited offline'])
    })
  })

  /**
   * A load chain empties the tab's factory array and refills it one record at a time, so
   * mid-chain it holds a fragment of the plan. Everything here is one rule: a loading tab
   * is read-only to the engine. Deriving anything from that fragment — a merge, an
   * overlay, a baseline, a diff — writes the truncation back and then reports it to
   * everyone else as the user having deleted their plan.
   */
  describe('a tab a load chain owns', () => {
    /** The chain has emptied the tab and remounted `keep` records so far. */
    const midLoad = (tab: FactoryTab, keep = 1) => {
      vi.spyOn(appStore, 'isTabLoading').mockImplementation(id => id === ROOM)
      tab.factories.splice(keep)
    }

    /** The chain finishes: the whole plan is back and the tab is the engine's again. */
    const loadCompleted = (tab: FactoryTab, factories = fixture) => {
      vi.mocked(appStore.isTabLoading).mockReturnValue(false)
      tab.factories = wire(factories)
      eventBus.emit('loadingCompleted')
    }

    const healRequest = () => joinsOf().at(-1)

    it('parks an inbound op instead of merging it into the fragment', () => {
      const tab = syncAt(fixture, 4)
      const joinsBefore = joinsOf().length
      midLoad(tab)

      const theirs = wire(fixture[1])
      theirs.name = 'Beta, theirs'
      receive({ type: 'op_apply', roomId: ROOM, revision: 5, diff: { factories: [theirs] } })

      // Nothing written, nothing adopted, and nothing asked for until the chain ends.
      expect(names(tab)).toEqual(['Alpha'])
      expect(store.rooms[ROOM].revision).toBe(4)
      expect(joinsOf()).toHaveLength(joinsBefore)

      loadCompleted(tab)

      // A join carrying no revision, which the server can only answer with a whole snapshot.
      expect(healRequest()).toBeDefined()
      expect(healRequest().lastRevision).toBeUndefined()

      const server = wire(fixture)
      server[1].name = 'Beta, theirs'
      receive({ type: 'snapshot', roomId: ROOM, room: snapshotOf(server, 5), revision: 5 })

      expect(names(tab)).toEqual(['Alpha', 'Beta, theirs'])
      expect(store.rooms[ROOM].revision).toBe(5)
    })

    /**
     * The nastiest of them: touched ids are persisted, so a cold boot carries a big set
     * of them into the first load. The overlay reads "touched and gone from local state"
     * as this client having deleted the record, and a record that has merely not been
     * remounted yet looks exactly like one.
     */
    it('never reads an unmounted factory as a deletion, touched or not', () => {
      const tab = syncAt(fixture, 4)
      store.markUserTouched(ROOM, 2)
      midLoad(tab)

      const server = wire(fixture)
      server[0].name = 'Alpha, theirs'
      receive({ type: 'snapshot', roomId: ROOM, room: snapshotOf(server, 5), revision: 5 })

      // Beta is still only unmounted. Overlaying intent onto the snapshot would have
      // dropped it from the server's copy and written that back.
      expect(names(tab)).toEqual(['Alpha'])

      loadCompleted(tab)
      receive({ type: 'snapshot', roomId: ROOM, room: snapshotOf(server, 5), revision: 5 })

      expect(names(tab)).toEqual(['Alpha, theirs', 'Beta'])
      expect(opsOf().flatMap(op => op.diff.removedFactoryIds ?? [])).toEqual([])
    })

    it('refuses to seed a baseline off the fragment when up_to_date lands', () => {
      const tab = setTab(wire(fixture))
      setTabMirrorMeta(ROOM, {
        revision: 9,
        appVersion: PROTOCOL_VERSION,
        userTouchedIds: [],
        userTouchedFields: [],
        declaredRemovals: [],
      })
      store.trackRoom(ROOM)
      connect()
      midLoad(tab)

      receive({ type: 'up_to_date', roomId: ROOM, revision: 9 })

      // A baseline taken here would hold one factory, and the next diff would report the
      // other as removed. The room stays un-seeded instead.
      expect(store.rooms[ROOM].status).toBe('joining')
      expect(opsOf()).toHaveLength(0)

      loadCompleted(tab)
      expect(healRequest().lastRevision).toBeUndefined()
    })

    it('parks a rejected op rather than rebasing onto the fragment', () => {
      const tab = syncAt(fixture, 4)
      tab.factories[0].name = 'Mine'
      store.markUserTouched(ROOM, 1)
      store.flushRoom(ROOM)
      const rejected = lastOp().opId
      midLoad(tab)

      receive({
        type: 'op_reject',
        roomId: ROOM,
        opId: rejected,
        reason: 'stale_base',
        snapshot: snapshotOf(fixture, 5),
      })

      expect(names(tab)).toEqual(['Mine'])
      expect(store.rooms[ROOM].hasPendingOp).toBe(false)

      loadCompleted(tab, [{ ...wire(fixture[0]), name: 'Mine' }, wire(fixture[1])])
      expect(healRequest().lastRevision).toBeUndefined()
    })

    /**
     * The wire guard, and the whole point of it: it does not consult `isLoaded`, the flag
     * whose failure let this reach production in the first place.
     */
    it('drops an op carrying removals and asks for a snapshot instead', () => {
      const tab = syncAt(fixture, 4)
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
      const joinsBefore = joinsOf().length
      midLoad(tab)
      // The exact hole: the app still believes it is loaded while the chain runs.
      expect(appStore.isLoaded).toBe(true)

      expect(store.flushRoom(ROOM)).toBe(false)

      expect(opsOf()).toHaveLength(0)
      expect(joinsOf()).toHaveLength(joinsBefore + 1)
      expect(healRequest().lastRevision).toBeUndefined()
      expect(errors).toHaveBeenCalledWith(
        expect.stringContaining('refusing to send factory removals'),
        expect.objectContaining({ factoryIds: [2] }),
      )
      errors.mockRestore()
    })

    // The negative control for the guard above: with nothing telling the engine a chain
    // owns the tab, the same fragment goes out as a deletion of half the room.
    it('would send that removal if the tab did not report itself as loading', () => {
      const tab = syncAt(fixture, 4)
      tab.factories.splice(1)

      expect(store.flushRoom(ROOM)).toBe(true)
      expect(lastOp().diff.removedFactoryIds).toEqual([2])
    })

    // The guard also has to cover the resend a rebase makes, which reaches the wire
    // through the same door rather than through a user edit.
    it('covers the resend a rebase makes', () => {
      const tab = syncAt(fixture, 4)
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
      store.markUserTouched(ROOM, 1)
      // Mid-load only from the flush's point of view: the rebase itself is allowed to
      // run so its trailing resend is the thing under test.
      tab.factories.splice(1)
      vi.spyOn(appStore, 'isTabLoading').mockImplementation(id => id === ROOM)

      expect(store.flushRoom(ROOM)).toBe(false)
      expect(opsOf().flatMap(op => op.diff.removedFactoryIds ?? [])).toEqual([])
      errors.mockRestore()
    })
  })

  describe('op builder', () => {
    it('sends changed records, removals and tab fields as one op', () => {
      const tab = syncAt(fixture, 4)

      tab.factories[0].name = 'Alpha renamed'
      tab.factories.splice(1, 1)
      tab.name = 'Renamed plan'

      expect(store.flushRoom(ROOM)).toBe(true)

      const op = lastOp()
      expect(op.baseRevision).toBe(4)
      expect(op.diff.factories.map((entry: Factory) => entry.id)).toEqual([1])
      expect(op.diff.removedFactoryIds).toEqual([2])
      expect(op.diff.name).toBe('Renamed plan')
    })

    it('keeps one op in flight per room', () => {
      const tab = syncAt(fixture, 4)
      tab.factories[0].name = 'First'
      store.flushRoom(ROOM)

      tab.factories[0].name = 'Second'

      expect(store.flushRoom(ROOM)).toBe(false)
      expect(opsOf()).toHaveLength(1)
    })

    it('never puts a live reactive record on the wire', () => {
      const tab = syncAt(fixture, 4)
      tab.factories[0].name = 'Alpha renamed'
      store.flushRoom(ROOM)

      const payload = lastOp().diff.factories[0]
      expect(() => structuredClone(payload)).not.toThrow()
    })

    it('coalesces a burst of edits into one op', () => {
      const tab = syncAt(fixture, 4)
      vi.useFakeTimers()

      tab.factories[0].name = 'Alpha renamed'
      eventBus.emit('factoryUpdated', tab.factories[0])
      eventBus.emit('factoryUpdated', tab.factories[0])
      eventBus.emit('calculationsCompleted')

      vi.advanceTimersByTime(399)
      expect(opsOf()).toHaveLength(0)

      vi.advanceTimersByTime(1)
      expect(opsOf()).toHaveLength(1)
    })

    it('never puts the room name in a member\'s op, which the server refuses whole', () => {
      const tab = syncAt(fixture, 4)
      appStore.setTabState(ROOM, { kind: 'synced', shared: true, role: 'member', revision: 4 })

      tab.name = 'Renamed by a member'
      tab.factories[0].name = 'Alpha renamed'

      expect(store.flushRoom(ROOM)).toBe(true)
      expect(lastOp().diff.name).toBeUndefined()
      expect(lastOp().diff.factories).toHaveLength(1)
    })

    it('takes factoryEdited as intent for the current tab', () => {
      const tab = syncAt(fixture, 4)
      expect(store.hasLocalEdits(ROOM)).toBe(false)

      eventBus.emit('factoryEdited', tab.factories[0])

      expect(store.hasLocalEdits(ROOM)).toBe(true)
    })
  })

  describe('acknowledgement', () => {
    it('advances the baseline to the sent snapshot and clears matching intent', () => {
      const tab = syncAt(fixture, 4)
      tab.factories[0].name = 'Alpha renamed'
      store.flushRoom(ROOM)

      receive({ type: 'op_ack', roomId: ROOM, opId: lastOp().opId, revision: 5 })

      expect(store.rooms[ROOM].revision).toBe(5)
      expect(store.hasLocalEdits(ROOM)).toBe(false)
      expect(store.flushRoom(ROOM)).toBe(false)
    })

    it('ignores an ack for an op it is not waiting on', () => {
      const tab = syncAt(fixture, 4)
      tab.factories[0].name = 'Alpha renamed'
      store.flushRoom(ROOM)

      receive({ type: 'op_ack', roomId: ROOM, opId: 'someone-elses-op', revision: 5 })

      expect(store.rooms[ROOM].revision).toBe(4)
      expect(store.rooms[ROOM].hasPendingOp).toBe(true)
    })

    it('keeps edits made after the send and puts them in the next op', () => {
      const tab = syncAt(fixture, 4)
      tab.factories[0].name = 'First'
      store.flushRoom(ROOM)
      const firstOp = lastOp()

      // Edited again while the first op was still in flight.
      tab.factories[0].name = 'Second'
      store.markUserTouched(ROOM, 1)

      receive({ type: 'op_ack', roomId: ROOM, opId: firstOp.opId, revision: 5 })

      const secondOp = lastOp()
      expect(opsOf()).toHaveLength(2)
      expect(secondOp.baseRevision).toBe(5)
      expect(secondOp.diff.factories.map((entry: Factory) => entry.name)).toEqual(['Second'])
    })
  })

  describe('the rebase path', () => {
    it('lets the local edit win a same-factory race and converges both sides', () => {
      const tab = syncAt(fixture, 4)
      tab.factories[0].name = 'Mine'
      store.markUserTouched(ROOM, 1)
      store.flushRoom(ROOM)

      // A second client got there first: the server is a revision ahead.
      const server = wire(fixture)
      server[0].name = 'Theirs'
      receive({
        type: 'op_reject',
        roomId: ROOM,
        opId: lastOp().opId,
        reason: 'stale_base',
        snapshot: snapshotOf(server, 5),
      })

      expect(names(tab)).toEqual(['Mine', 'Beta'])

      const resend = lastOp()
      expect(resend.baseRevision).toBe(5)
      expect(mergeFactories(server, resend.diff).map(entry => entry.name)).toEqual(names(tab))
    })

    it('keeps both changes when the two clients touched different factories', () => {
      const tab = syncAt(fixture, 4)
      tab.factories[0].name = 'Mine'
      store.markUserTouched(ROOM, 1)
      store.flushRoom(ROOM)

      const server = wire(fixture)
      server[1].name = 'Theirs'
      receive({
        type: 'op_reject',
        roomId: ROOM,
        opId: lastOp().opId,
        reason: 'stale_base',
        snapshot: snapshotOf(server, 5),
      })

      expect(names(tab)).toEqual(['Mine', 'Theirs'])
    })

    it('re-applies a local deletion over the adopted snapshot', () => {
      const tab = syncAt(fixture, 4)
      tab.factories.splice(1, 1)
      store.flushRoom(ROOM)

      receive({
        type: 'op_reject',
        roomId: ROOM,
        opId: lastOp().opId,
        reason: 'stale_base',
        snapshot: snapshotOf(fixture, 5),
      })

      expect(names(tab)).toEqual(['Alpha'])
      expect(lastOp().diff.removedFactoryIds).toEqual([2])
    })

    it('applies an inbound op directly when there is nothing local to keep', () => {
      const tab = syncAt(fixture, 4)
      const emit = vi.spyOn(eventBus, 'emit')

      const theirs = wire(fixture[1])
      theirs.name = 'Theirs'
      receive({ type: 'op_apply', roomId: ROOM, revision: 5, diff: { factories: [theirs] } })

      expect(names(tab)).toEqual(['Alpha', 'Theirs'])
      expect(store.rooms[ROOM].revision).toBe(5)
      // No recalculation: the sender already did it, so the diff applies byte for byte.
      expect(emit.mock.calls.some(call => call[0] === 'calculationsCompleted')).toBe(false)
      expect(opsOf()).toHaveLength(0)
      emit.mockRestore()
    })

    it('announces a peer\'s op as a plan change, but not their rename or reorder', () => {
      syncAt(fixture, 4)
      const emit = vi.spyOn(eventBus, 'emit')
      const applied = () => emit.mock.calls.filter(call => call[0] === 'planContentApplied')

      const moved = wire(fixture)
      moved[0].displayOrder = 1
      moved[1].displayOrder = 0
      moved[0].name = 'Renamed by them'
      receive({ type: 'op_apply', roomId: ROOM, revision: 5, diff: { factories: moved } })
      expect(applied()).toHaveLength(0)

      const edited = wire(fixture[1])
      edited.notes = 'Needs a second smelter'
      receive({ type: 'op_apply', roomId: ROOM, revision: 6, diff: { factories: [edited] } })

      expect(applied()).toEqual([['planContentApplied', { tabId: ROOM }]])
      emit.mockRestore()
    })

    /**
     * A diff is replace-by-id, so the only thing saying two records swapped is
     * their `displayOrder` — and the array's order is what the planner renders.
     * Without re-deriving it the peer's data lands and the screen does not move.
     */
    it('re-orders the plan when a peer\'s diff moves records past each other', () => {
      const tab = syncAt(fixture, 4)

      const moved = wire(fixture)
      moved[0].displayOrder = 1
      moved[1].displayOrder = 0
      receive({ type: 'op_apply', roomId: ROOM, revision: 5, diff: { factories: moved } })

      expect(names(tab)).toEqual(['Beta', 'Alpha'])
    })

    it('renders a snapshot in the order its records claim', () => {
      const moved = wire(fixture)
      moved[0].displayOrder = 1
      moved[1].displayOrder = 0

      const tab = setTab([])
      store.trackRoom(ROOM)
      connect()
      receive({ type: 'snapshot', roomId: ROOM, room: snapshotOf(moved, 3), revision: 3 })

      expect(names(tab)).toEqual(['Beta', 'Alpha'])
    })

    it('rebases an inbound op over a pending one without asking for a snapshot', () => {
      const tab = syncAt(fixture, 4)
      tab.factories[0].name = 'Mine'
      store.markUserTouched(ROOM, 1)
      store.flushRoom(ROOM)

      const theirs = wire(fixture[1])
      theirs.name = 'Theirs'
      receive({ type: 'op_apply', roomId: ROOM, revision: 5, diff: { factories: [theirs] } })

      expect(names(tab)).toEqual(['Mine', 'Theirs'])
      expect(joinsOf()).toHaveLength(1)
      expect(lastOp().baseRevision).toBe(5)
    })

    it('asks for a snapshot when the inbound revision skips ahead', () => {
      const tab = syncAt(fixture, 4)
      tab.factories[0].name = 'Mine'
      store.markUserTouched(ROOM, 1)
      store.flushRoom(ROOM)

      receive({ type: 'op_apply', roomId: ROOM, revision: 7, diff: { factories: [] } })

      expect(joinsOf().at(-1)).toEqual({ type: 'join', roomId: ROOM })
    })

    it('loses nothing when the socket drops before the ack and edits followed the send', () => {
      vi.useFakeTimers()
      const tab = syncAt(fixture, 4)
      tab.factories[0].name = 'Sent'
      store.markUserTouched(ROOM, 1)
      store.flushRoom(ROOM)

      // Edited again, then the connection died with the op unacknowledged.
      tab.factories[0].name = 'After the send'
      store.markUserTouched(ROOM, 1)
      latest().serverClose(1011)
      expect(store.rooms[ROOM].hasPendingOp).toBe(false)

      vi.advanceTimersByTime(1_000)
      latest().open()
      receive(helloOk)

      // The op had in fact landed: the server is a revision ahead, carrying "Sent".
      const server = wire(fixture)
      server[0].name = 'Sent'
      receive({ type: 'snapshot', roomId: ROOM, room: snapshotOf(server, 5), revision: 5 })

      expect(names(tab)).toEqual(['After the send', 'Beta'])
      expect(lastOp().baseRevision).toBe(5)
      expect(lastOp().diff.factories.map((entry: Factory) => entry.name)).toEqual(['After the send'])
    })

    it('sends nothing when the dropped op had already been applied', () => {
      vi.useFakeTimers()
      const tab = syncAt(fixture, 4)
      tab.factories[0].name = 'Sent'
      store.markUserTouched(ROOM, 1)
      store.flushRoom(ROOM)

      latest().serverClose(1011)
      vi.advanceTimersByTime(1_000)
      latest().open()
      receive(helloOk)

      const server = wire(fixture)
      server[0].name = 'Sent'
      receive({ type: 'snapshot', roomId: ROOM, room: snapshotOf(server, 5), revision: 5 })

      expect(names(tab)).toEqual(['Sent', 'Beta'])
      expect(opsOf()).toHaveLength(0)
      expect(store.hasLocalEdits(ROOM)).toBe(false)
    })

    it('pauses a room the server keeps refusing, and resends once resumed', () => {
      const tab = syncAt(fixture, 4)
      tab.factories[0].name = 'Mine'
      store.markUserTouched(ROOM, 1)
      store.flushRoom(ROOM)

      for (let revision = 5; revision <= 7; revision++) {
        const server = wire(fixture)
        server[0].name = `Theirs ${revision}`
        receive({
          type: 'op_reject',
          roomId: ROOM,
          opId: lastOp().opId,
          reason: 'stale_base',
          snapshot: snapshotOf(server, revision),
        })
      }

      expect(store.rooms[ROOM].status).toBe('paused')
      expect(opsOf()).toHaveLength(3)

      store.resumeRoom(ROOM)

      expect(store.rooms[ROOM].status).toBe('synced')
      expect(opsOf()).toHaveLength(4)
    })

    // Nothing in the UI calls resumeRoom, so without this a paused room is receive-only
    // until the page is reloaded — and says nothing about it while it is.
    it('lets the idle probe clear a pause nobody else would', () => {
      const tab = syncAt(fixture, 4)
      tab.factories[0].name = 'Mine'
      store.markUserTouched(ROOM, 1)
      store.flushRoom(ROOM)

      for (let revision = 5; revision <= 7; revision++) {
        const server = wire(fixture)
        server[0].name = `Theirs ${revision}`
        receive({
          type: 'op_reject',
          roomId: ROOM,
          opId: lastOp().opId,
          reason: 'stale_base',
          snapshot: snapshotOf(server, revision),
        })
      }
      expect(store.rooms[ROOM].status).toBe('paused')
      const sentWhilePaused = opsOf().length

      store.probeTick()

      expect(store.rooms[ROOM].status).toBe('synced')
      expect(opsOf().length).toBeGreaterThan(sentWhilePaused)
    })

    it('turns the tab into a local copy when a reject carries no snapshot', () => {
      const tab = syncAt(fixture, 4)
      tab.factories[0].name = 'Mine'
      store.flushRoom(ROOM)

      receive({ type: 'op_reject', roomId: ROOM, opId: lastOp().opId, reason: 'forbidden' })

      expect(store.rooms[ROOM].status).toBe('revoked')
      expect(names(tab)).toEqual(['Mine', 'Beta'])
      expect(readTabMirrorMeta()[ROOM]).toBeUndefined()
    })
  })

  describe('room lifecycle messages', () => {
    it('drops a deleted room without closing the socket', () => {
      const tab = syncAt(fixture, 4)

      receive({ type: 'room_deleted', roomId: ROOM })

      expect(store.rooms[ROOM].status).toBe('deleted')
      expect(latest().closedWith).toBeNull()
      expect(names(tab)).toEqual(['Alpha', 'Beta'])
      expect(readTabMirrorMeta()[ROOM]).toBeUndefined()
    })

    it('follows a server rename and sends nothing back', () => {
      const tab = syncAt(fixture, 4)

      receive({
        type: 'room_meta',
        roomId: ROOM,
        meta: { name: 'Server name', slug: 'three-word-slug', shared: true, hasPassword: false },
      })

      expect(tab.name).toBe('Server name')
      expect(store.flushRoom(ROOM)).toBe(false)
    })

    it('does not clobber an unsent local rename', () => {
      const tab = syncAt(fixture, 4)
      tab.name = 'Mine'
      store.markTabTouched(ROOM, 'name')

      receive({
        type: 'room_meta',
        roomId: ROOM,
        meta: { name: 'Server name', slug: null, shared: false, hasPassword: false },
      })

      expect(tab.name).toBe('Mine')
    })

    it('drops only the revoked room and reconnects the socket for the rest', () => {
      const tab = syncAt(fixture, 4)
      appStore.addTab({ id: 'room-2', name: 'Other', factories: [] }, { activate: false })
      store.trackRoom('room-2')
      const socket = latest()

      // The gateway names the room, then takes the whole socket down with it.
      receive({ type: 'error', roomId: ROOM, code: 'forbidden', message: 'Access revoked.' })
      socket.serverClose(4403)

      expect(store.rooms[ROOM].status).toBe('revoked')
      expect(names(tab)).toEqual(['Alpha', 'Beta'])
      expect(store.rooms['room-2'].status).not.toBe('revoked')
      expect(sockets).toHaveLength(2)
    })

    it('stays down when the revoked room was the only one', () => {
      syncAt(fixture, 4)

      receive({ type: 'error', roomId: ROOM, code: 'forbidden', message: 'Access revoked.' })
      latest().serverClose(4403)

      expect(sockets).toHaveLength(1)
    })

    it('signs the session out when the handshake is rejected 4401', () => {
      const emit = vi.spyOn(eventBus, 'emit')
      syncAt(fixture, 4)

      latest().serverClose(4401)

      expect(emit.mock.calls.some(call => call[0] === 'sessionExpired')).toBe(true)
      emit.mockRestore()
    })

    it('records presence, the rooms revision and errors', () => {
      syncAt(fixture, 4)

      receive({ type: 'presence', roomId: ROOM, count: 3 })
      receive({ type: 'rooms_changed', roomsRevision: 12 })
      receive({ type: 'error', roomId: ROOM, code: 'rate_limited', message: 'Too many messages.' })

      expect(store.rooms[ROOM].presence).toBe(3)
      expect(store.roomsRevision).toBe(12)
      expect(store.roomsListStale).toBe(true)
      expect(store.rooms[ROOM].lastError).toBe('rate_limited')
    })
  })

  describe('offline mode', () => {
    it('goes silent on the manual switch', () => {
      const tab = syncAt(fixture, 4)
      const socket = latest()

      store.enterOffline()

      expect(store.mode).toBe('offline')
      expect(store.isOffline).toBe(true)
      expect(socket.closedWith?.code).toBe(1000)

      tab.factories[0].name = 'Offline edit'
      expect(store.flushRoom(ROOM)).toBe(false)
      expect(store.join(ROOM)).toBe(false)
    })

    it('raises the prompt after repeated reconnect failures', () => {
      vi.useFakeTimers()
      syncAt(fixture, 4)

      for (const delay of [1_000, 2_000, 4_000]) {
        latest().serverClose(1011)
        expect(store.mode).toBe(delay === 4_000 ? 'offlinePrompt' : 'reconnecting')
        vi.advanceTimersByTime(delay)
      }

      expect(store.failedReconnects).toBe(3)
      expect(store.mode).toBe('offlinePrompt')
    })

    it('raises the prompt on a browser offline signal', () => {
      syncAt(fixture, 4)

      window.dispatchEvent(new Event('offline'))

      expect(store.mode).toBe('offlinePrompt')
    })

    it('announces offline mode once, on a timer rather than for ever', () => {
      syncAt(fixture, 4)
      const emit = vi.spyOn(eventBus, 'emit')

      store.enterOffline()

      expect(emit).toHaveBeenCalledWith('toast', expect.objectContaining({
        variant: 'timed',
        timeout: OFFLINE_NOTICE_MS,
      }))
    })

    it('goes back to quiet retrying when the prompt is declined', () => {
      syncAt(fixture, 4)
      window.dispatchEvent(new Event('offline'))

      store.dismissOfflinePrompt()

      expect(store.mode).toBe('reconnecting')
      expect(store.failedReconnects).toBe(0)
    })

    it('remembers a factory added while offline and sends it after the reconnect', () => {
      vi.useFakeTimers()
      const tab = syncAt(fixture, 4)
      store.enterOffline()

      const added = newFactory('Gamma', 2, 3)
      tab.factories.push(added)
      eventBus.emit('factoryUpdated', added)
      // Nothing can be sent, but the add still has to be recorded as intent.
      vi.advanceTimersByTime(OP_DEBOUNCE_MS)
      expect(store.hasLocalEdits(ROOM)).toBe(true)

      store.exitOffline()
      latest().open()
      receive(helloOk)
      receive({ type: 'snapshot', roomId: ROOM, room: snapshotOf(fixture, 6), revision: 6 })

      expect(names(tab)).toEqual(['Alpha', 'Beta', 'Gamma'])
      expect(lastOp().diff.factories.some((entry: Factory) => entry.name === 'Gamma')).toBe(true)
    })

    it('reports a deletion made offline before a restart', () => {
      // The baseline died with the browser session; the mirror and the intent did not.
      const tab = setTab(wire(fixture))
      tab.factories.splice(1, 1)
      setTabMirrorMeta(ROOM, {
        revision: 9,
        appVersion: PROTOCOL_VERSION,
        userTouchedIds: [2],
        userTouchedFields: [],
        declaredRemovals: [],
      })

      store.trackRoom(ROOM)
      connect()
      receive({ type: 'up_to_date', roomId: ROOM, revision: 9 })

      expect(lastOp().diff.removedFactoryIds).toEqual([2])
    })

    // The notes field emits exactly this pair. It used to emit only `factoryUpdated`,
    // which is payload rather than intent, so the rebase below dropped the note.
    it('keeps a notes-only edit made offline across the reconnect', () => {
      vi.useFakeTimers()
      const tab = syncAt(fixture, 4)
      store.enterOffline()

      tab.factories[0].notes = 'Written while offline'
      eventBus.emit('factoryUpdated', tab.factories[0])
      eventBus.emit('factoryEdited', tab.factories[0])
      vi.advanceTimersByTime(OP_DEBOUNCE_MS)

      store.exitOffline()
      latest().open()
      receive(helloOk)

      // The server moved on while we were away, so the note only survives if the
      // rebase treats that factory as one the user touched.
      const server = wire(fixture)
      server[1].name = 'Theirs'
      receive({ type: 'snapshot', roomId: ROOM, room: snapshotOf(server, 6), revision: 6 })

      expect(tab.factories[0].notes).toBe('Written while offline')
      expect(names(tab)).toEqual(['Alpha', 'Theirs'])
      const sent = lastOp().diff.factories as Factory[]
      expect(sent.find(entry => entry.id === 1)?.notes).toBe('Written while offline')
    })

    it('rebases every room on the way out of offline mode', () => {
      const tab = syncAt(fixture, 4)
      store.enterOffline()

      tab.factories[0].name = 'Offline edit'
      store.markUserTouched(ROOM, 1)

      store.exitOffline()
      expect(store.mode).toBe('reconnecting')

      latest().open()
      receive(helloOk)

      const server = wire(fixture)
      server[1].name = 'Theirs'
      receive({ type: 'snapshot', roomId: ROOM, room: snapshotOf(server, 6), revision: 6 })

      expect(names(tab)).toEqual(['Offline edit', 'Theirs'])
      expect(lastOp().baseRevision).toBe(6)
    })
  })

  /**
   * The class of edit no calculation announces: a user changes a stored field, nothing
   * recalculates, and only the UI saying `factoryEdited` makes it intent. Each case emits
   * exactly the pair its handler now emits and is then put through the two recovery paths
   * the rebase serves — a divergent snapshot, and a refused op.
   */
  describe('content edits that only the UI can declare', () => {
    interface ContentEdit {
      what: string
      edit: (factory: Factory) => void
      read: (factory: Factory) => unknown
      expected: unknown
    }

    const edits: ContentEdit[] = [
      {
        what: 'a rename',
        edit: factory => { factory.name = 'Renamed here' },
        read: factory => factory.name,
        expected: 'Renamed here',
      },
      {
        what: 'a task',
        edit: factory => factory.tasks.push({ title: 'Build the smelters', completed: false }),
        read: factory => factory.tasks,
        expected: [{ title: 'Build the smelters', completed: false }],
      },
      {
        what: 'a collapsed card',
        edit: factory => { factory.hidden = true },
        read: factory => factory.hidden,
        expected: true,
      },
      {
        what: 'a game sync mark',
        edit: factory => setSyncState(factory),
        read: factory => factory.inSync,
        expected: true,
      },
      {
        what: 'an opened building group tray',
        edit: factory => { factory.products[0].buildingGroupsTrayOpen = true },
        read: factory => factory.products[0].buildingGroupsTrayOpen,
        expected: true,
      },
      {
        what: 'an export calculator setting',
        edit: factory => {
          factory.exportCalculator.IronIngot = { selected: '2', factorySettings: {} }
        },
        read: factory => factory.exportCalculator.IronIngot?.selected,
        expected: '2',
      },
      {
        what: 'a building group sync toggle',
        edit: factory => { factory.products[0].buildingGroupItemSync = false },
        read: factory => factory.products[0].buildingGroupItemSync,
        expected: false,
      },
      {
        what: 'a clock set across the groups',
        edit: factory => factory.products[0].buildingGroups.forEach(group => {
          group.overclockPercent = 250
          group.clockSetByUser = false
        }),
        read: factory => factory.products[0].buildingGroups.map(group => group.overclockPercent),
        expected: [250],
      },
      {
        what: 'a blank product row',
        edit: factory => addProductToFactory(factory, { id: '', amount: 1 }),
        read: factory => factory.products.length,
        expected: 2,
      },
      {
        what: 'a blank import row',
        edit: factory => factory.inputs.push({ factoryId: null, outputPart: null, amount: 0 }),
        read: factory => factory.inputs.length,
        expected: 1,
      },
      // The five below arrived with the merge of main. Each writes a stored field that no
      // calculation announces, so each is exactly the class the audit exists to catch.
      {
        what: 'a checklist tick',
        edit: factory => toggleChecklistProduct(factory, factory.products[0]),
        read: factory => factory.products[0].completed,
        expected: true,
      },
      {
        what: 'the checklist being switched on',
        edit: factory => setChecklistEnabled(factory, true),
        read: factory => factory.checklistEnabled,
        expected: true,
      },
      {
        what: 'a sink placed on a surplus',
        edit: factory => setSinkCount(factory, 'IronIngot', 3),
        read: factory => getDisposal(factory, 'IronIngot'),
        expected: { sinks: 3, depots: 0 },
      },
      {
        what: 'a depot uploader',
        edit: factory => setDepotCount(factory, 'IronIngot', 2),
        read: factory => getDisposal(factory, 'IronIngot'),
        expected: { sinks: 0, depots: 2 },
      },
      {
        what: 'a custom building',
        edit: factory => addCustomBuildingToFactory(factory, { building: 'portal', amount: 2 }),
        read: factory => factory.customBuildings.map(entry => entry.building),
        expected: ['portal'],
      },
    ]

    /** Alpha produces something, so a game sync mark and a tray have somewhere to live. */
    let producing: Factory[]

    beforeEach(() => {
      producing = [newFactory('Alpha', 0, 1), newFactory('Beta', 1, 2)]
      addProductToFactory(producing[0], { id: 'IronIngot', amount: 30, recipe: 'IngotIron' })
      calculateFactories(producing, gameData, { origin: 'recalculate' })
      producing = wire(producing)
    })

    const apply = (tab: FactoryTab, edit: ContentEdit) => {
      edit.edit(tab.factories[0])
      eventBus.emit('factoryUpdated', tab.factories[0])
      eventBus.emit('factoryEdited', tab.factories[0])
    }

    /** What the server did while this client was busy: a different factory, so no true conflict. */
    const moved = (revision: number) => {
      const server = wire(producing)
      server[1].name = 'Theirs'
      return snapshotOf(server, revision)
    }

    const sentBack = (edit: ContentEdit) => {
      const sent = lastOp().diff.factories as Factory[]
      return edit.read(sent.find(entry => entry.id === 1) as Factory)
    }

    it.each(edits)('keeps $what made offline across the reconnect', edit => {
      vi.useFakeTimers()
      const tab = syncAt(producing, 4)
      store.enterOffline()

      apply(tab, edit)
      vi.advanceTimersByTime(OP_DEBOUNCE_MS)

      store.exitOffline()
      latest().open()
      receive(helloOk)
      receive({ type: 'snapshot', roomId: ROOM, room: moved(6), revision: 6 })

      expect(edit.read(tab.factories[0])).toEqual(edit.expected)
      expect(names(tab)[1]).toBe('Theirs')
      expect(sentBack(edit)).toEqual(edit.expected)
    })

    it.each(edits)('keeps $what through a refused op', edit => {
      vi.useFakeTimers()
      const tab = syncAt(producing, 4)

      apply(tab, edit)
      vi.advanceTimersByTime(OP_DEBOUNCE_MS)
      const refused = lastOp().opId

      receive({
        type: 'op_reject',
        roomId: ROOM,
        opId: refused,
        reason: 'stale_base',
        snapshot: moved(5),
      })

      expect(edit.read(tab.factories[0])).toEqual(edit.expected)
      expect(names(tab)[1]).toBe('Theirs')
      expect(lastOp().baseRevision).toBe(5)
      expect(sentBack(edit)).toEqual(edit.expected)
    })

    // The other half of the contract: an inbound op is not this client's intent, so the
    // factory it rewrites must not become one this client overlays from then on.
    it('claims no intent for a factory an inbound op rewrote', () => {
      const tab = syncAt(producing, 4)

      const theirs = wire(producing[0])
      theirs.name = 'Renamed by a peer'
      receive({ type: 'op_apply', roomId: ROOM, diff: { factories: [theirs] }, revision: 5 })

      expect(tab.factories[0].name).toBe('Renamed by a peer')
      expect(store.hasLocalEdits(ROOM)).toBe(false)
      expect(readTabMirrorMeta()[ROOM]?.userTouchedIds).toEqual([])
    })
  })

  /**
   * A move, a copy or a delete reindexes `displayOrder` across the whole plan, so the records
   * that changed are not only the one the user clicked. Marking only that one leaves the rest
   * on the server's old indexes, which is a plan that renders in an order nobody chose.
   */
  describe('a reorder, which changes records the user never clicked', () => {
    const swapOrder = (tab: FactoryTab) => {
      const [first, second] = tab.factories
      const order = first.displayOrder
      first.displayOrder = second.displayOrder
      second.displayOrder = order
      // What Planner.vue's moveFactory now emits: one pair per record the reindex moved.
      for (const factory of [first, second]) {
        eventBus.emit('factoryUpdated', factory)
        eventBus.emit('factoryEdited', factory)
      }
    }

    const orders = (tab: FactoryTab) => tab.factories.map(entry => entry.displayOrder)

    const orderOf = (tab: FactoryTab, name: string) =>
      tab.factories.find(entry => entry.name === name)?.displayOrder

    it('carries every moved record over a divergent snapshot', () => {
      vi.useFakeTimers()
      const tab = syncAt(fixture, 4)
      store.enterOffline()

      swapOrder(tab)
      vi.advanceTimersByTime(OP_DEBOUNCE_MS)

      store.exitOffline()
      latest().open()
      receive(helloOk)
      receive({ type: 'snapshot', roomId: ROOM, room: snapshotOf(fixture, 6), revision: 6 })

      // By name, not by position: the tab is re-derived from the indexes it now
      // holds, so the array reads Beta-then-Alpha and both records carry the move.
      expect(orderOf(tab, 'Alpha')).toBe(1)
      expect(orderOf(tab, 'Beta')).toBe(0)

      const sent = lastOp().diff.factories as Factory[]
      expect(sent.map(entry => [entry.name, entry.displayOrder])).toEqual(
        expect.arrayContaining([['Alpha', 1], ['Beta', 0]]),
      )
    })

    // Without the second factory's own emit the overlay keeps only the clicked one, and the
    // untouched half comes back off the server on its old index.
    it('loses the record whose move was never declared', () => {
      vi.useFakeTimers()
      const tab = syncAt(fixture, 4)
      store.enterOffline()

      const [first, second] = tab.factories
      first.displayOrder = 1
      second.displayOrder = 0
      eventBus.emit('factoryUpdated', first)
      eventBus.emit('factoryEdited', first)
      vi.advanceTimersByTime(OP_DEBOUNCE_MS)

      store.exitOffline()
      latest().open()
      receive(helloOk)
      receive({ type: 'snapshot', roomId: ROOM, room: snapshotOf(fixture, 6), revision: 6 })

      expect(orders(tab)).toEqual([1, 1])
    })
  })

  /**
   * "Clear all" replaced both arrays and announced nothing — no intent, no payload —
   * so the removals were never flushed and the next rebase brought the whole plan
   * back off the server.
   */
  describe('clearing the whole plan', () => {
    /** Points the store's own tab pointer at the room, as a real tab switch would. */
    const clearThroughTheStore = (tab: FactoryTab) => {
      appStore.currentFactoryTab = tab
      appStore.inited = true
      appStore.clearFactories()
    }

    // Nothing was announced at all, so no flush was ever scheduled: the removals sat
    // in the browser until some later, unrelated edit happened to carry them.
    it('schedules an op of its own carrying every removal', () => {
      vi.useFakeTimers()
      const tab = syncAt(fixture, 4)

      clearThroughTheStore(tab)
      vi.advanceTimersByTime(OP_DEBOUNCE_MS)

      expect(opsOf()).toHaveLength(1)
      expect(lastOp().diff.removedFactoryIds).toEqual([1, 2])
      expect(lastOp().diff.factories).toBeUndefined()
    })

    // Intent has to land at the clear, not at the flush: an inbound op arriving first
    // is applied straight into the tab when this client is holding nothing.
    it('is not resurrected by an inbound op that lands before the flush', () => {
      const tab = syncAt(fixture, 4)
      clearThroughTheStore(tab)

      const theirs = wire(fixture[1])
      theirs.name = 'Beta, theirs'
      receive({ type: 'op_apply', roomId: ROOM, revision: 5, diff: { factories: [theirs] } })

      expect(tab.factories).toEqual([])
    })

    it('stays cleared over a snapshot the other side moved on', () => {
      const tab = syncAt(fixture, 4)
      clearThroughTheStore(tab)
      store.flushRoom(ROOM)

      // The peer edited while the clear was in flight, so it comes back rejected.
      const theirs = wire(fixture)
      theirs[0].name = 'Alpha, theirs'
      receive({
        type: 'op_reject',
        roomId: ROOM,
        opId: lastOp().opId,
        reason: 'stale_base',
        snapshot: snapshotOf(theirs, 5),
      })

      expect(tab.factories).toEqual([])
      expect(lastOp().baseRevision).toBe(5)
      expect(lastOp().diff.removedFactoryIds).toEqual([1, 2])
    })

    it('holds the removals through an offline restart', () => {
      vi.useFakeTimers()
      const tab = syncAt(fixture, 4)
      store.enterOffline()

      clearThroughTheStore(tab)
      vi.advanceTimersByTime(OP_DEBOUNCE_MS)

      store.exitOffline()
      latest().open()
      receive(helloOk)
      receive({ type: 'snapshot', roomId: ROOM, room: snapshotOf(fixture, 6), revision: 6 })

      expect(tab.factories).toEqual([])
      expect(lastOp().diff.removedFactoryIds).toEqual([1, 2])
    })
  })

  /**
   * Past a handful of removals in one op the server wants the client to say the user meant
   * it, because that many is a whole-plan replacement rather than an edit — and the shape a
   * truncated client produces. Only a bulk action declares, so the two are told apart.
   */
  describe('declared bulk removals', () => {
    const BIG = 8
    let big: Factory[]

    const clearThroughTheStore = (tab: FactoryTab) => {
      appStore.currentFactoryTab = tab
      appStore.inited = true
      appStore.clearFactories()
    }

    beforeEach(() => {
      big = Array.from({ length: BIG }, (_unused, index) =>
        newFactory(`Factory ${index}`, index, index + 1))
      calculateFactories(big, gameData, { origin: 'recalculate' })
      big = wire(big)
    })

    it('declares the removals a cleared plan produced', () => {
      vi.useFakeTimers()
      const tab = syncAt(big, 4)

      clearThroughTheStore(tab)
      vi.advanceTimersByTime(OP_DEBOUNCE_MS)

      expect(lastOp().diff.removedFactoryIds).toHaveLength(BIG)
      expect(lastOp().bulkRemoval).toBe(true)
    })

    // Single deletes coalesce into one op behind a slow ack, and past the threshold that op
    // needs the claim too — so each delete declares its own id at the site of the delete.
    it('declares a burst of single deletes made through the store', () => {
      vi.useFakeTimers()
      const tab = syncAt(big, 4)
      appStore.currentFactoryTab = tab
      appStore.inited = true

      for (const id of big.slice(0, 6).map(entry => entry.id)) appStore.removeFactory(id)
      vi.advanceTimersByTime(OP_DEBOUNCE_MS)

      expect(lastOp().diff.removedFactoryIds).toHaveLength(6)
      expect(lastOp().bulkRemoval).toBe(true)
    })

    // The truncation shape, and the whole point of the flag: the array shrinks and no bulk
    // action ever said so, so the op goes without the claim and the server refuses it.
    it('claims nothing for a shrink no bulk action declared', () => {
      vi.useFakeTimers()
      const tab = syncAt(big, 4)

      tab.factories.splice(2, 6)
      eventBus.emit('factoryUpdated', tab.factories[0])
      vi.advanceTimersByTime(OP_DEBOUNCE_MS)

      expect(lastOp().diff.removedFactoryIds).toHaveLength(6)
      expect(lastOp().bulkRemoval).toBeUndefined()
    })

    it('writes the declaration to the mirror, not just to the engine', () => {
      vi.useFakeTimers()
      const tab = syncAt(big, 4)

      clearThroughTheStore(tab)
      vi.advanceTimersByTime(OP_DEBOUNCE_MS)

      expect(readTabMirrorMeta()[ROOM]?.declaredRemovals).toEqual(big.map(entry => entry.id))
    })

    // The op may be a restart away: cleared while offline, or behind a pending op. Read back
    // off the mirror the removals still have to reach the server as the user's own.
    it('still declares them after a restart that only has the mirror', () => {
      setTab([])
      setTabMirrorMeta(ROOM, {
        revision: 4,
        appVersion: PROTOCOL_VERSION,
        userTouchedIds: big.map(entry => entry.id),
        userTouchedFields: [],
        declaredRemovals: big.map(entry => entry.id),
      })

      store.trackRoom(ROOM)
      connect()
      receive({ type: 'snapshot', roomId: ROOM, room: snapshotOf(big, 4), revision: 4 })

      expect(lastOp().diff.removedFactoryIds).toHaveLength(BIG)
      expect(lastOp().bulkRemoval).toBe(true)
    })

    it('keeps the declaration through a reject, so the resend still carries it', () => {
      const tab = syncAt(big, 4)
      clearThroughTheStore(tab)
      store.flushRoom(ROOM)

      receive({
        type: 'op_reject',
        roomId: ROOM,
        opId: lastOp().opId,
        reason: 'stale_base',
        snapshot: snapshotOf(big, 5),
      })

      expect(lastOp().baseRevision).toBe(5)
      expect(lastOp().bulkRemoval).toBe(true)
    })

    // Spent, not held: a record the baseline no longer carries can never be removed again,
    // and a declaration that outlived its removal would launder the next accidental one.
    it('spends the declaration once the server has the removals', () => {
      const tab = syncAt(big, 4)
      clearThroughTheStore(tab)
      store.flushRoom(ROOM)

      receive({ type: 'op_ack', roomId: ROOM, opId: lastOp().opId, revision: 5 })

      expect(readTabMirrorMeta()[ROOM]?.declaredRemovals).toEqual([])
    })

    // Without this the refusal is a loop: the rebase reads the removals as intent, resends
    // them, and is refused again every probe cycle while the plan stays gone on one screen.
    it('takes the refused records back rather than resending them for ever', () => {
      vi.useFakeTimers()
      const tab = syncAt(big, 4)

      tab.factories.splice(2, 6)
      eventBus.emit('factoryUpdated', tab.factories[0])
      vi.advanceTimersByTime(OP_DEBOUNCE_MS)
      const refused = lastOp()

      receive({
        type: 'op_reject',
        roomId: ROOM,
        opId: refused.opId,
        reason: 'undeclared_bulk_removal',
        snapshot: snapshotOf(big, 4),
      })
      vi.advanceTimersByTime(OP_DEBOUNCE_MS)

      expect(names(tab)).toHaveLength(BIG)
      expect(lastOp().opId).toBe(refused.opId)
    })
  })

  /**
   * The one case nothing else covers: this device edited factories while it was away,
   * somebody else edited the same ones, and the two only meet when a fresh snapshot lands.
   * Live editing is not this — a reject there is the routine 400ms race.
   */
  describe('the offline conflict prompt', () => {
    let producing: Factory[]

    const asked = () => store.conflicts[ROOM]?.factories ?? []

    const inTab = (tab: FactoryTab, id: number) => tab.factories.find(factory => factory.id === id)

    const amountOf = (factory: Factory | undefined, item: string) =>
      factory?.products.find(product => product.id === item)?.amount

    const sentFactories = () => (lastOp().diff.factories ?? []) as Factory[]

    /**
     * The origin the product field itself uses. On a plain `recalculate` the building
     * groups are sacrosanct and a typed amount is pulled straight back to them, so a
     * fixture that edits an amount any other way silently edits nothing.
     */
    const recalc = (plan: Factory[]) => calculateFactories(plan, gameData, { origin: 'item' })

    /** A whole plan as another client would have calculated it before storing it. */
    const serverPlan = (mutate: (plan: Factory[]) => void): Factory[] => {
      const plan = wire(producing)
      mutate(plan)
      recalc(plan)
      return wire(plan)
    }

    /** An edit made here, declared the way every UI edit declares itself. */
    const editHere = (tab: FactoryTab, id: number, item: string, amount: number) => {
      const product = inTab(tab, id)?.products.find(entry => entry.id === item)
      if (product) product.amount = amount
      recalc(tab.factories)
      store.markUserTouched(ROOM, id)
    }

    const reconnectWith = (server: Factory[], revision: number) => {
      store.exitOffline()
      latest().open()
      receive(helloOk)
      receive({ type: 'snapshot', roomId: ROOM, room: snapshotOf(server, revision), revision })
    }

    /** Alpha and Beta edited on both sides while away; Gamma only here. */
    const clashOnReconnect = () => {
      const tab = syncAt(producing, 4)
      store.enterOffline()
      editHere(tab, 1, 'IronIngot', 111)
      editHere(tab, 2, 'CopperIngot', 222)
      editHere(tab, 3, 'IronPlate', 333)

      reconnectWith(serverPlan(plan => {
        plan[0].products[0].amount = 444
        plan[1].products[0].amount = 555
      }), 6)
      return tab
    }

    beforeEach(() => {
      // The resolution hands a changed plan back to the loader; these specs are about
      // what it decided, not about the staggered render that follows.
      vi.spyOn(appStore, 'reloadTabFromMirror').mockResolvedValue()

      producing = [newFactory('Alpha', 0, 1), newFactory('Beta', 1, 2), newFactory('Gamma', 2, 3)]
      addProductToFactory(producing[0], { id: 'IronIngot', amount: 30, recipe: 'IngotIron' })
      addProductToFactory(producing[1], { id: 'CopperIngot', amount: 40, recipe: 'IngotCopper' })
      addProductToFactory(producing[2], { id: 'IronPlate', amount: 20, recipe: 'IronPlate' })
      recalc(producing)
      producing = wire(producing)
    })

    it('asks about the factories both sides edited, and about nothing else', () => {
      clashOnReconnect()

      expect(asked().map(row => row.factoryId)).toEqual([1, 2])
      expect(asked()[0].products).toEqual([
        { itemId: 'IronIngot', live: 444, mine: 111, recipeChanged: false },
      ])
    })

    // The negative control for the trigger: the room moved, this device has unsent edits,
    // and the two do not overlap. Nothing to decide, so nothing is asked.
    it('stays silent when the room moved a factory nobody here edited', () => {
      const tab = syncAt(producing, 4)
      store.enterOffline()
      editHere(tab, 3, 'IronPlate', 333)

      reconnectWith(serverPlan(plan => { plan[0].products[0].amount = 444 }), 6)

      expect(store.conflicts[ROOM]).toBeUndefined()
      expect(sentFactories().map(factory => factory.id)).toContain(3)
    })

    /**
     * A socket can die between the write and the ack, so the snapshot that comes back may
     * be carrying this device's own op. Asking about that is asking the user to choose
     * between two moments of their own typing.
     */
    it('stays silent when the snapshot is this device\'s own op coming back', () => {
      vi.useFakeTimers()
      const tab = syncAt(producing, 4)
      editHere(tab, 1, 'IronIngot', 111)
      store.flushRoom(ROOM)

      editHere(tab, 1, 'IronIngot', 222)
      latest().serverClose(1011)
      vi.advanceTimersByTime(1_000)
      latest().open()
      receive(helloOk)

      // The op had in fact landed: the room is a revision ahead, carrying our own 111.
      const server = serverPlan(plan => { plan[0].products[0].amount = 111 })
      receive({ type: 'snapshot', roomId: ROOM, room: snapshotOf(server, 5), revision: 5 })

      expect(store.conflicts[ROOM]).toBeUndefined()
      expect(amountOf(inTab(tab, 1), 'IronIngot')).toBe(222)
    })

    it('stays silent for a rejected op rebased mid-edit, however much it clashes', () => {
      const tab = syncAt(producing, 4)
      editHere(tab, 1, 'IronIngot', 111)
      store.flushRoom(ROOM)

      receive({
        type: 'op_reject',
        roomId: ROOM,
        opId: lastOp().opId,
        reason: 'stale_base',
        snapshot: snapshotOf(serverPlan(plan => { plan[0].products[0].amount = 444 }), 5),
      })

      expect(store.conflicts[ROOM]).toBeUndefined()
    })

    // The load chain owns the plan array, so mid-chain there is no version of "mine" worth
    // showing anyone. The parked snapshot is what the question is finally asked about.
    it('asks nothing until the snapshot parked by a load is applied', async () => {
      const tab = syncAt(producing, 4)
      appStore.currentFactoryTab = tab
      store.enterOffline()
      editHere(tab, 1, 'IronIngot', 111)

      const server = serverPlan(plan => { plan[0].products[0].amount = 444 })
      store.exitOffline()
      latest().open()
      receive(helloOk)

      const loading = appStore.prepareLoader(tab.factories)
      receive({ type: 'snapshot', roomId: ROOM, room: snapshotOf(server, 6), revision: 6 })
      expect(store.conflicts[ROOM], 'asked about a plan the loader was still staging').toBeUndefined()

      await loading
      await vi.waitFor(() => {
        if (appStore.loadInFlight) throw new Error('the queued load is still running')
      })

      receive({ type: 'snapshot', roomId: ROOM, room: snapshotOf(server, 6), revision: 6 })
      expect(asked().map(row => row.factoryId)).toEqual([1])
    })

    it('holds the room\'s ops until the clash is answered', () => {
      clashOnReconnect()

      expect(opsOf(), 'this device\'s version went out before anyone chose it').toHaveLength(0)
      expect(store.flushRoom(ROOM)).toBe(false)
      store.flushAll()
      expect(opsOf()).toHaveLength(0)
    })

    it('sends this device\'s version of everything when mine wins throughout', () => {
      const tab = clashOnReconnect()

      store.resolveConflict(ROOM, { liveWinners: [] })

      expect(amountOf(inTab(tab, 1), 'IronIngot')).toBe(111)
      expect(amountOf(sentFactories().find(factory => factory.id === 1), 'IronIngot')).toBe(111)
      expect(amountOf(sentFactories().find(factory => factory.id === 2), 'CopperIngot')).toBe(222)
      expect(amountOf(sentFactories().find(factory => factory.id === 3), 'IronPlate')).toBe(333)
    })

    it('gives up the clashing records when the live plan wins, and keeps the rest', () => {
      const tab = clashOnReconnect()

      store.resolveConflict(ROOM, { liveWinners: [1, 2] })

      expect(amountOf(inTab(tab, 1), 'IronIngot')).toBe(444)
      expect(amountOf(inTab(tab, 2), 'CopperIngot')).toBe(555)
      expect(amountOf(inTab(tab, 3), 'IronPlate')).toBe(333)
      // Intent goes for exactly the ids the user handed over, and no others.
      expect(readTabMirrorMeta()[ROOM]?.userTouchedIds).toEqual([3])
      expect(amountOf(sentFactories().find(factory => factory.id === 3), 'IronPlate')).toBe(333)
    })

    it('produces one op carrying the mine-winners and the edits nobody fought over', () => {
      const tab = clashOnReconnect()

      store.resolveConflict(ROOM, { liveWinners: [2] })

      expect(opsOf()).toHaveLength(1)
      expect(amountOf(sentFactories().find(factory => factory.id === 1), 'IronIngot')).toBe(111)
      expect(amountOf(sentFactories().find(factory => factory.id === 3), 'IronPlate')).toBe(333)
      expect(sentFactories().map(factory => factory.id)).not.toContain(2)
      expect(amountOf(inTab(tab, 2), 'CopperIngot')).toBe(555)
    })

    /**
     * The rebase that raised the question hands the plan to the loader, so an answer can
     * land while a chain owns the factory array. Written into it then it would be
     * half-overwritten and then committed, so the answer waits for the chain instead.
     */
    it('parks an answer given while a load chain owns the plan', async () => {
      const tab = clashOnReconnect()
      appStore.currentFactoryTab = tab

      const loading = appStore.prepareLoader(tab.factories)
      store.resolveConflict(ROOM, { liveWinners: [1, 2] })

      expect(store.conflicts[ROOM], 'the question was left open').toBeUndefined()
      expect(amountOf(inTab(tab, 1), 'IronIngot'), 'written into the fragment anyway').not.toBe(444)

      await loading
      await vi.waitFor(() => {
        if (appStore.loadInFlight) throw new Error('the queued load is still running')
      })
      // The flush the load schedules is what picks the parked answer back up.
      store.flushAll()

      expect(amountOf(inTab(tab, 1), 'IronIngot')).toBe(444)
      expect(amountOf(inTab(tab, 3), 'IronPlate')).toBe(333)
    })

    it('keeps this device\'s plan as a local tab when asked', () => {
      clashOnReconnect()

      store.resolveConflict(ROOM, { liveWinners: [1, 2], keepCopy: true })

      const copy = appStore.getTabs().find(tab => tab.name === 'Plan (offline copy)')
      expect(copy, 'nothing kept this device\'s version').toBeDefined()
      expect(amountOf(copy?.factories.find(factory => factory.id === 1), 'IronIngot')).toBe(111)
      expect(amountOf(copy?.factories.find(factory => factory.id === 2), 'CopperIngot')).toBe(222)
      // A plain local tab: nobody is moved off what they were looking at, and it syncs nothing.
      expect(appStore.getCurrentTab()?.id).toBe(ROOM)
      expect(store.rooms[copy?.id ?? '']).toBeUndefined()
    })

    it('keeps no copy when the box is cleared', () => {
      clashOnReconnect()

      store.resolveConflict(ROOM, { liveWinners: [1, 2], keepCopy: false })

      expect(appStore.getTabs().map(tab => tab.name)).toEqual(['Plan'])
    })

    it('re-measures an open question against a newer snapshot', () => {
      clashOnReconnect()

      receive({
        type: 'snapshot',
        roomId: ROOM,
        room: snapshotOf(serverPlan(plan => {
          plan[0].products[0].amount = 999
          plan[1].products[0].amount = 555
        }), 7),
        revision: 7,
      })

      expect(asked()[0].products[0].live).toBe(999)
    })

    it('closes the question unprompted when the overlap disappears', () => {
      clashOnReconnect()

      // The room lands on what this device holds: there is nothing left to pick between.
      receive({
        type: 'snapshot',
        roomId: ROOM,
        room: snapshotOf(serverPlan(plan => {
          plan[0].products[0].amount = 111
          plan[1].products[0].amount = 222
        }), 7),
        revision: 7,
      })

      expect(store.conflicts[ROOM]).toBeUndefined()
    })

    it('drops the question when the room stops being tracked', () => {
      clashOnReconnect()

      store.untrackRoom(ROOM)

      expect(store.conflicts[ROOM]).toBeUndefined()
    })

    it('drops the question when the room is deleted under it', () => {
      clashOnReconnect()

      receive({ type: 'room_deleted', roomId: ROOM })

      expect(store.conflicts[ROOM]).toBeUndefined()
    })

    describe('a factory the live plan deleted', () => {
      const deletedThere = () => {
        const tab = syncAt(producing, 4)
        store.enterOffline()
        editHere(tab, 1, 'IronIngot', 111)
        reconnectWith(serverPlan(plan => { plan.splice(0, 1) }), 6)
        return tab
      }

      it('is asked about with this device\'s products as the mine side', () => {
        deletedThere()

        expect(asked()[0].liveDeleted).toBe(true)
        expect(asked()[0].products).toEqual([
          { itemId: 'IronIngot', live: null, mine: 111, recipeChanged: false },
        ])
      })

      it('is restored, and sent back, when mine wins', () => {
        const tab = deletedThere()

        store.resolveConflict(ROOM, { liveWinners: [] })

        expect(inTab(tab, 1)).toBeDefined()
        expect(sentFactories().map(factory => factory.id)).toContain(1)
      })

      it('stays deleted when the live plan wins', () => {
        const tab = deletedThere()

        store.resolveConflict(ROOM, { liveWinners: [1] })

        expect(inTab(tab, 1)).toBeUndefined()
        expect(readTabMirrorMeta()[ROOM]?.userTouchedIds).toEqual([])
      })
    })

    /**
     * A device reopened days later has no baseline at all: the mirror carries the plan, the
     * ids it edited, and a fingerprint of what the server held for each. Without the
     * fingerprint every unsent edit would read as a clash.
     */
    describe('a device reopened with edits it never sent', () => {
      const reopenWith = (server: Factory[]) => {
        const mine = wire(producing)
        mine[0].products[0].amount = 111
        recalc(mine)
        const tab = setTab(mine)

        setTabMirrorMeta(ROOM, {
          revision: 4,
          appVersion: PROTOCOL_VERSION,
          userTouchedIds: [1],
          userTouchedFields: [],
          declaredRemovals: [],
          baselinePrints: { 1: fingerprint(stableStringify(producing[0])) },
        })

        store.trackRoom(ROOM)
        connect()
        receive({ type: 'snapshot', roomId: ROOM, room: snapshotOf(server, 6), revision: 6 })
        return tab
      }

      it('asks about the record a peer changed while it was closed', () => {
        reopenWith(serverPlan(plan => { plan[0].products[0].amount = 444 }))

        expect(asked().map(row => row.factoryId)).toEqual([1])
        expect(asked()[0].products).toEqual([
          { itemId: 'IronIngot', live: 444, mine: 111, recipeChanged: false },
        ])
      })

      it('stays silent when the server still holds what it was left holding', () => {
        reopenWith(serverPlan(plan => { plan[1].products[0].amount = 555 }))

        expect(store.conflicts[ROOM]).toBeUndefined()
      })
    })
  })

  describe('a tab field the user set on its own', () => {
    it('survives the reconnect, and is re-sent', () => {
      vi.useFakeTimers()
      const tab = syncAt(fixture, 4)
      store.enterOffline()

      tab.powerTarget = 2400
      eventBus.emit('tabEdited', 'powerTarget')
      vi.advanceTimersByTime(OP_DEBOUNCE_MS)

      store.exitOffline()
      latest().open()
      receive(helloOk)
      receive({
        type: 'snapshot',
        roomId: ROOM,
        room: snapshotOf(fixture, 6, { powerTarget: 900 }),
        revision: 6,
      })

      expect(tab.powerTarget).toBe(2400)
      expect(lastOp().diff.powerTarget).toBe(2400)
    })

    // The group list is the other tab-owned field, and creating or renaming one recalculates
    // nothing at all — useFactoryGroups saying so is the only signal the engine ever gets.
    it('keeps a group list made offline, and re-sends it', () => {
      vi.useFakeTimers()
      const tab = syncAt(fixture, 4)
      store.enterOffline()

      tab.groups = [{ id: 'g-1', name: 'Smelting', color: '#ff0000', order: 0 }]
      eventBus.emit('tabEdited', 'groups')
      vi.advanceTimersByTime(OP_DEBOUNCE_MS)

      store.exitOffline()
      latest().open()
      receive(helloOk)
      receive({
        type: 'snapshot',
        roomId: ROOM,
        room: snapshotOf(fixture, 6, {
          groups: [{ id: 'g-2', name: 'Theirs', color: '#00ff00', order: 0 }],
        }),
        revision: 6,
      })

      expect(tab.groups?.map(group => group.name)).toEqual(['Smelting'])
      expect((lastOp().diff.groups as { name: string }[]).map(group => group.name)).toEqual(['Smelting'])
    })

    // The Depot research the plan is written against. It decides what an Uploader moves, so a
    // tab that could not send it would report a fully-researched save's capacity on every other
    // device the plan is open on.
    it('carries the depot tiers, which nothing recalculates', () => {
      vi.useFakeTimers()
      const tab = syncAt(fixture, 4)
      store.enterOffline()

      tab.depotUploadTier = 1
      tab.depotExpansionTier = 3
      eventBus.emit('tabEdited', 'depotUploadTier')
      eventBus.emit('tabEdited', 'depotExpansionTier')
      vi.advanceTimersByTime(OP_DEBOUNCE_MS)

      store.exitOffline()
      latest().open()
      receive(helloOk)
      receive({
        type: 'snapshot',
        roomId: ROOM,
        room: snapshotOf(fixture, 6, { depotUploadTier: 4, depotExpansionTier: 4 }),
        revision: 6,
      })

      expect(tab.depotUploadTier).toBe(1)
      expect(tab.depotExpansionTier).toBe(3)
      expect(lastOp().diff.depotUploadTier).toBe(1)
      expect(lastOp().diff.depotExpansionTier).toBe(3)
    })

    // Dismissing the raw-resources notice is the user answering for this plan. Without this the
    // rebase puts the unanswered plan back and the notice returns on the next reconnect.
    it('carries the answered-for stamp', () => {
      vi.useFakeTimers()
      const tab = syncAt(fixture, 4)

      tab.plannerVersion = '0.6.0'
      eventBus.emit('tabEdited', 'plannerVersion')
      vi.advanceTimersByTime(OP_DEBOUNCE_MS)
      const refused = lastOp().opId

      receive({
        type: 'op_reject',
        roomId: ROOM,
        opId: refused,
        reason: 'stale_base',
        snapshot: snapshotOf(fixture, 5),
      })

      expect(tab.plannerVersion).toBe('0.6.0')
      expect(lastOp().diff.plannerVersion).toBe('0.6.0')
    })

    // The room is the authoritative copy, and `addTab` stamps a brand-new empty tab as
    // answered-for — the tab created to join someone else's room is exactly that. Keeping the
    // stamp would push "this plan has been answered for" onto a room whose owner was never
    // asked, silencing their raw-resources notice. A snapshot therefore clears it.
    it('takes the room\'s answer over a stamp the tab arrived holding', () => {
      vi.useFakeTimers()
      const tab = syncAt(fixture, 4)
      tab.plannerVersion = '0.6.0'

      receive({ type: 'snapshot', roomId: ROOM, room: snapshotOf(fixture, 5), revision: 5 })
      vi.advanceTimersByTime(OP_DEBOUNCE_MS)

      expect(tab.plannerVersion).toBeUndefined()
      expect(opsOf()).toHaveLength(0)
    })

    it('takes a room setting the tab has none of its own', () => {
      const tab = syncAt(fixture, 4)
      delete tab.depotUploadTier

      receive({
        type: 'snapshot',
        roomId: ROOM,
        room: snapshotOf(fixture, 5, { depotUploadTier: 2 }),
        revision: 5,
      })

      expect(tab.depotUploadTier).toBe(2)
      expect(opsOf()).toHaveLength(0)
    })

    // Without the emit nothing schedules a flush, so an inbound op lands first and the
    // engine — holding no record of an edit — simply takes the server's number.
    it('is taken by the server when the UI never said anything', () => {
      const tab = syncAt(fixture, 4)

      tab.powerTarget = 2400
      receive({ type: 'op_apply', roomId: ROOM, diff: { powerTarget: 900 }, revision: 5 })

      expect(tab.powerTarget).toBe(900)
    })
  })

  describe('persistence', () => {
    it('keeps the render mirror in today\'s shape and the sync metadata beside it', () => {
      vi.useFakeTimers()
      const tab = syncAt(fixture, 4)
      tab.factories[0].name = 'Alpha renamed'
      store.markUserTouched(ROOM, 1)
      store.flushRoom(ROOM)

      vi.advanceTimersByTime(600)

      const stored = JSON.parse(localStorage.getItem('factoryTabs') ?? '[]') as FactoryTab[]
      expect(Object.keys(stored[0]).sort()).toEqual(['factories', 'groups', 'id', 'name', 'powerTarget'])
      expect(stored[0].id).toBe(ROOM)
      expect(stored[0].factories.every(entry => typeof entry.id === 'number')).toBe(true)

      const meta = readTabMirrorMeta()[ROOM]
      expect(meta.revision).toBe(4)
      expect(meta.appVersion).toBe(PROTOCOL_VERSION)
      expect(meta.userTouchedIds).toEqual([1])
    })

    it('prunes metadata for tabs the mirror no longer holds', () => {
      syncAt(fixture, 4)
      setTabMirrorMeta('a-dead-tab', {
        revision: 1,
        appVersion: PROTOCOL_VERSION,
        userTouchedIds: [],
        userTouchedFields: [],
        declaredRemovals: [],
      })

      store.pruneMirrorMeta()

      expect(Object.keys(readTabMirrorMeta())).toEqual([ROOM])
    })

    it('forgets a room entirely when it stops being tracked', () => {
      syncAt(fixture, 4)

      store.untrackRoom(ROOM)

      expect(store.rooms[ROOM]).toBeUndefined()
      expect(readTabMirrorMeta()[ROOM]).toBeUndefined()
      expect(framesOf().at(-1)).toEqual({ type: 'leave', roomId: ROOM })
    })
  })

  describe('the idle revision probe', () => {
    // Post-commit broadcasts are best-effort, so a dropped op_apply leaves a
    // client stale with nothing to notice the gap. The probe is the noticing.
    it('re-joins with the acked revision and takes the healing snapshot', () => {
      const tab = syncAt(fixture, 3)
      const joins = joinsOf().length

      expect(store.probeRevision(ROOM)).toBe(true)
      expect(joinsOf().length).toBe(joins + 1)
      expect(joinsOf().at(-1)).toMatchObject({ roomId: ROOM, lastRevision: 3 })

      // The reply carries an edit this client never received.
      const healed = wire(fixture)
      healed[0].notes = 'written while the frame was lost'
      receive({ type: 'snapshot', roomId: ROOM, room: snapshotOf(healed, 4), revision: 4 })

      expect(tab.factories[0].notes).toBe('written while the frame was lost')
      expect(store.rooms[ROOM].revision).toBe(4)
      expect(store.rooms[ROOM].status).toBe('synced')
    })

    it('stays quiet while an op is in flight or edits are pending', () => {
      const tab = syncAt(fixture, 3)
      tab.factories[0].name = 'Alpha edited'
      store.markUserTouched(ROOM, 1)
      store.flushRoom(ROOM)
      const joins = joinsOf().length

      expect(store.probeRevision(ROOM)).toBe(false)
      expect(joinsOf().length).toBe(joins)
    })

    it('stays quiet in offline mode', () => {
      syncAt(fixture, 3)
      store.enterOffline()
      const joins = joinsOf().length

      expect(store.probeRevision(ROOM)).toBe(false)
      expect(joinsOf().length).toBe(joins)
    })

    it('fires from the interval without being asked', () => {
      vi.useFakeTimers()
      setActivePinia(createPinia())
      appStore = useAppStore()
      appStore.isLoaded = true
      sockets = []
      store = useRoomSyncStore()
      store.configure({
        socket: new SyncSocket({
          url: 'ws://test.local/ws',
          socketFactory: url => {
            const socket = new FakeSocket(url)
            sockets.push(socket)
            return socket
          },
        }),
      })
      syncAt(fixture, 3)
      const joins = joinsOf().length

      vi.advanceTimersByTime(REVISION_PROBE_MS)

      expect(joinsOf().length).toBe(joins + 1)
      expect(joinsOf().at(-1)).toMatchObject({ roomId: ROOM, lastRevision: 3 })
    })
  })

  describe('field locks', () => {
    const lockFrames = (socket = latest()) =>
      framesOf(socket).filter(frame => frame.type === 'lock' || frame.type === 'unlock')

    /** A live room the user can hand to someone else, which is the only kind that locks. */
    const sharedRoom = (): FactoryTab => {
      const tab = syncAt(fixture, 3)
      appStore.setTabState(ROOM, { kind: 'synced', shared: true, role: 'owner', revision: 3 })
      return tab
    }

    const peerHolds = (fieldKey: string) => {
      receive({ type: 'field_locks', roomId: ROOM, locks: [{ fieldKey, holder: 'conn-2' }] })
    }

    it('claims the field the user focused', () => {
      sharedRoom()

      expect(store.claimField(ROOM, 'notes:1')).toBe(true)

      expect(lockFrames()).toEqual([{ type: 'lock', roomId: ROOM, fieldKey: 'notes:1' }])
    })

    // A private tab is one person's, and a local one is not on the wire at all.
    it('sends nothing for a tab nobody else can be in', () => {
      syncAt(fixture, 3)

      expect(store.claimField(ROOM, 'notes:1')).toBe(false)
      expect(lockFrames()).toHaveLength(0)
    })

    it('sends nothing while offline mode is on', () => {
      sharedRoom()
      store.enterOffline()

      expect(store.claimField(ROOM, 'notes:1')).toBe(false)
      expect(lockFrames()).toHaveLength(0)
    })

    // The whole of how a frame is read: a holder that is not this socket's own id.
    it('disables a field a peer holds and never one of its own', () => {
      sharedRoom()

      peerHolds('notes:1')
      expect(store.lockedByOther(ROOM, 'notes:1')).toBe(true)
      expect(store.lockedByOther(ROOM, 'notes:2')).toBe(false)

      receive({ type: 'field_locks', roomId: ROOM, locks: [{ fieldKey: 'notes:1', holder: 'conn-1' }] })
      expect(store.lockedByOther(ROOM, 'notes:1')).toBe(false)
    })

    it('re-states the room in full, so a released lock stops disabling anything', () => {
      sharedRoom()
      peerHolds('notes:1')

      receive({ type: 'field_locks', roomId: ROOM, locks: [] })

      expect(store.lockedByOther(ROOM, 'notes:1')).toBe(false)
    })

    it('throttles a typist to one frame per renewal window', () => {
      vi.useFakeTimers()
      sharedRoom()
      store.claimField(ROOM, 'notes:1')

      store.renewField(ROOM, 'notes:1')
      store.renewField(ROOM, 'notes:1')
      expect(lockFrames()).toHaveLength(1)

      vi.advanceTimersByTime(FIELD_LOCK_RENEW_MS)
      store.renewField(ROOM, 'notes:1')

      expect(lockFrames()).toHaveLength(2)
    })

    it('releases the field on blur', () => {
      sharedRoom()
      store.claimField(ROOM, 'notes:1')

      expect(store.releaseField(ROOM, 'notes:1')).toBe(true)

      expect(lockFrames().at(-1)).toEqual({ type: 'unlock', roomId: ROOM, fieldKey: 'notes:1' })
      // Nothing held, so a second blur is not a second frame.
      expect(store.releaseField(ROOM, 'notes:1')).toBe(false)
    })

    // The server expires an idle claim at the same line but only announces it on the
    // sweep, so giving it up here is what tells the room within ten seconds.
    it('gives up a lock nobody typed into for the whole idle window', () => {
      vi.useFakeTimers()
      sharedRoom()
      store.claimField(ROOM, 'notes:1')

      vi.advanceTimersByTime(FIELD_LOCK_TTL_MS - 1)
      expect(lockFrames()).toHaveLength(1)

      vi.advanceTimersByTime(1)
      expect(lockFrames().at(-1)).toEqual({ type: 'unlock', roomId: ROOM, fieldKey: 'notes:1' })
    })

    it('pushes that line back on every renewal', () => {
      vi.useFakeTimers()
      sharedRoom()
      store.claimField(ROOM, 'notes:1')

      vi.advanceTimersByTime(FIELD_LOCK_RENEW_MS)
      store.renewField(ROOM, 'notes:1')
      vi.advanceTimersByTime(FIELD_LOCK_TTL_MS - 1)

      expect(lockFrames().filter(frame => frame.type === 'unlock')).toHaveLength(0)
    })

    it('claims the field again when typing resumes after a lapse', () => {
      vi.useFakeTimers()
      sharedRoom()
      store.claimField(ROOM, 'notes:1')
      vi.advanceTimersByTime(FIELD_LOCK_TTL_MS)

      store.renewField(ROOM, 'notes:1')

      expect(lockFrames().at(-1)).toEqual({ type: 'lock', roomId: ROOM, fieldKey: 'notes:1' })
    })

    // Switching away is a blur the field never gets: the card unmounts first.
    it('releases everything it holds when the user switches tab', async () => {
      sharedRoom()
      store.claimField(ROOM, 'notes:1')

      appStore.factoryTabs.push({ id: 'other-tab', name: 'Other', factories: [], powerTarget: 0, groups: [] })
      appStore.currentFactoryTabIndex = 1
      await nextTick()

      expect(lockFrames().at(-1)).toEqual({ type: 'unlock', roomId: ROOM, fieldKey: 'notes:1' })
    })

    it('releases everything it holds on the way into offline mode', () => {
      sharedRoom()
      store.claimField(ROOM, 'notes:1')

      store.enterOffline()

      expect(lockFrames().at(-1)).toEqual({ type: 'unlock', roomId: ROOM, fieldKey: 'notes:1' })
    })

    /**
     * A dropped socket released every lock server-side, and a re-join is told what a
     * room holds only when it holds something. A display kept across the gap would
     * disable a field nobody is in, with no frame coming to correct it.
     */
    it('forgets what it was shown when the socket drops', () => {
      sharedRoom()
      peerHolds('notes:1')

      latest().serverClose(1006)

      expect(store.lockedByOther(ROOM, 'notes:1')).toBe(false)
    })

    it('forgets a room it has stopped tracking', () => {
      sharedRoom()
      peerHolds('notes:1')

      store.untrackRoom(ROOM)

      expect(store.lockedByOther(ROOM, 'notes:1')).toBe(false)
    })
  })
})
