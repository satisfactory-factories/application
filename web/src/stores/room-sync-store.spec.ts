import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { PROTOCOL_VERSION } from 'common'
import type { Factory, FactoryTab, RoomSnapshot, ServerMessage } from 'common'
import { SyncSocket } from '@/sync/ws-client'
import type { WebSocketLike } from '@/sync/ws-client'
import { OP_DEBOUNCE_MS, useRoomSyncStore } from '@/stores/room-sync-store'
import { useAppStore } from '@/stores/app-store'
import { calculateFactories, newFactory } from '@/utils/factory-management/factory'
import { addCustomBuildingToFactory } from '@/utils/factory-management/custom-buildings'
import { addProductToFactory } from '@/utils/factory-management/products'
import { getDisposal, setDepotCount, setSinkCount } from '@/utils/factory-management/disposal'
import { setChecklistEnabled, toggleChecklistProduct } from '@/utils/factory-management/checklist'
import { setSyncState } from '@/utils/factory-management/syncState'
import { gameData } from '@/utils/gameData'
import { mergeFactories } from '@/sync/room-state'
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

    it('sends a snapshot through the loader funnel rather than in behind it', () => {
      const reload = vi.spyOn(appStore, 'reloadTabFromMirror').mockResolvedValue()
      setTab([])
      store.trackRoom(ROOM)
      connect()

      receive({ type: 'snapshot', roomId: ROOM, room: snapshotOf(fixture, 4), revision: 4 })

      expect(reload).toHaveBeenCalledWith(ROOM)
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
      })
      store.trackRoom(ROOM)
      connect()

      receive({ type: 'up_to_date', roomId: ROOM, revision: 9 })

      const op = lastOp()
      expect(op.baseRevision).toBe(9)
      expect(op.diff.factories.map((entry: Factory) => entry.name)).toEqual(['Edited offline'])
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

      expect(orders(tab)).toEqual([1, 0])
      const sent = lastOp().diff.factories as Factory[]
      expect(sent.map(entry => entry.displayOrder)).toEqual([1, 0])
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
})
