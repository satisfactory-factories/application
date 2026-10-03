import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLOSE_CODES, PROTOCOL_VERSION } from 'common'
import type { ServerMessage } from 'common'
import { reconnectDelay, SyncSocket, syncSocketUrl } from '@/sync/ws-client'
import type { WebSocketLike } from '@/sync/ws-client'
import eventBus from '@/utils/eventBus'

const SOCKET_OPEN = 1
const SOCKET_CLOSED = 3

/** A hand-driven stand-in: nothing happens until a test says it happens. */
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

  // ==== Test drivers

  open (): void {
    this.onopen?.({})
  }

  receive (message: ServerMessage | string): void {
    this.onmessage?.({ data: typeof message === 'string' ? message : JSON.stringify(message) })
  }

  serverClose (code: number): void {
    this.readyState = SOCKET_CLOSED
    this.onclose?.({ code })
  }

  get frames (): unknown[] {
    return this.sent.map(frame => JSON.parse(frame))
  }
}

const helloOk: ServerMessage = {
  type: 'hello_ok',
  protocolVersion: PROTOCOL_VERSION,
  userId: 'user-1',
  roomsRevision: 4,
  connectionId: 'conn-1',
}

describe('SyncSocket', () => {
  let sockets: FakeSocket[]
  let client: SyncSocket
  let emitSpy: ReturnType<typeof vi.spyOn>

  const latest = () => sockets[sockets.length - 1]

  /** Connect and complete the handshake, leaving the socket connected. */
  const handshake = (token?: string) => {
    client.connect(token)
    latest().open()
    latest().receive(helloOk)
  }

  beforeEach(() => {
    vi.useFakeTimers()
    sockets = []
    emitSpy = vi.spyOn(eventBus, 'emit')
    client = new SyncSocket({
      url: 'ws://test.local/ws',
      socketFactory: url => {
        const socket = new FakeSocket(url)
        sockets.push(socket)
        return socket
      },
    })
  })

  afterEach(() => {
    client.stop()
    vi.useRealTimers()
    emitSpy.mockRestore()
  })

  describe('url', () => {
    it('swaps the API scheme for the socket one', () => {
      expect(syncSocketUrl('http://localhost:3001')).toBe('ws://localhost:3001/ws')
      expect(syncSocketUrl('https://api.satisfactory-factories.app')).toBe('wss://api.satisfactory-factories.app/ws')
    })
  })

  describe('handshake', () => {
    it('starts idle', () => {
      expect(client.status).toBe('idle')
      expect(client.isConnected).toBe(false)
    })

    it('opens a socket and says hello with the protocol version', () => {
      client.connect()
      expect(client.status).toBe('connecting')

      latest().open()
      expect(latest().frames).toEqual([{ type: 'hello', protocolVersion: PROTOCOL_VERSION }])
    })

    it('carries the account token in hello when there is one', () => {
      client.connect('jwt-token')
      latest().open()
      expect(latest().frames[0]).toEqual({
        type: 'hello',
        protocolVersion: PROTOCOL_VERSION,
        token: 'jwt-token',
      })
    })

    it('reaches connected on hello_ok', () => {
      const seen: string[] = []
      client.onStatus(status => seen.push(status))

      handshake()

      expect(client.status).toBe('connected')
      expect(client.isConnected).toBe(true)
      expect(seen).toEqual(['connecting', 'connected'])
    })

    it('does not open a second socket while one is live', () => {
      handshake()
      client.connect()
      expect(sockets).toHaveLength(1)
    })
  })

  describe('messages', () => {
    it('hands every server message to subscribers', () => {
      const received: ServerMessage[] = []
      client.onMessage(message => received.push(message))

      handshake()
      const upToDate: ServerMessage = { type: 'up_to_date', roomId: 'room-1', revision: 7 }
      latest().receive(upToDate)

      expect(received).toEqual([helloOk, upToDate])
    })

    it('stops delivering after unsubscribe', () => {
      const received: ServerMessage[] = []
      const off = client.onMessage(message => received.push(message))

      handshake()
      off()
      latest().receive({ type: 'presence', roomId: 'room-1', count: 2 })

      expect(received).toEqual([helloOk])
    })

    it('ignores frames that are not protocol messages', () => {
      const received: ServerMessage[] = []
      client.onMessage(message => received.push(message))

      handshake()
      latest().receive('not json at all')
      latest().receive('null')
      latest().receive('{"no":"type"}')

      expect(received).toEqual([helloOk])
    })
  })

  describe('sending', () => {
    it('refuses to send before the socket is open', () => {
      expect(client.join('room-1')).toBe(false)
    })

    it('sends join, leave and op frames', () => {
      handshake()
      const socket = latest()
      socket.sent.length = 0

      expect(client.join('room-1', { lastRevision: 3, visitorToken: 'visitor' })).toBe(true)
      expect(client.leave('room-1')).toBe(true)
      expect(client.sendOp({
        roomId: 'room-1',
        opId: 'op-1',
        baseRevision: 3,
        diff: { name: 'Renamed' },
      })).toBe(true)

      expect(socket.frames).toEqual([
        { type: 'join', roomId: 'room-1', lastRevision: 3, visitorToken: 'visitor' },
        { type: 'leave', roomId: 'room-1' },
        { type: 'op', roomId: 'room-1', opId: 'op-1', baseRevision: 3, diff: { name: 'Renamed' } },
      ])
    })

    it('drops sends once the socket has closed', () => {
      handshake()
      latest().serverClose(1006)
      expect(client.sendOp({ roomId: 'r', opId: 'o', baseRevision: 1, diff: {} })).toBe(false)
    })
  })

  describe('close codes', () => {
    it.each([
      ['unauthorized', CLOSE_CODES.unauthorized],
      ['forbidden', CLOSE_CODES.forbidden],
    ])('stops for good on %s', (_name, code) => {
      handshake()
      latest().serverClose(code)

      expect(client.status).toBe('stopped')
      expect(client.lastCloseCode).toBe(code)

      vi.advanceTimersByTime(120_000)
      expect(sockets).toHaveLength(1)
    })

    it('reports a version mismatch and announces it', () => {
      handshake()
      latest().serverClose(CLOSE_CODES.versionMismatch)

      expect(client.status).toBe('version_mismatch')
      expect(emitSpy).toHaveBeenCalledWith('versionMismatch', { source: 'ws' })

      vi.advanceTimersByTime(120_000)
      expect(sockets).toHaveLength(1)
    })

    it.each([1006, 1008, 1009, 1011, 1013])('reconnects after close %i', code => {
      handshake()
      latest().serverClose(code)

      expect(client.status).toBe('reconnecting')
      vi.advanceTimersByTime(1_000)
      expect(sockets).toHaveLength(2)
    })
  })

  describe('backoff', () => {
    it('computes 1s doubling to a 30s cap', () => {
      expect([0, 1, 2, 3, 4, 5, 6, 10].map(reconnectDelay))
        .toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000])
    })

    it('walks the sequence across repeated failures', () => {
      handshake()

      for (const delay of [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]) {
        const before = sockets.length
        latest().serverClose(1011)

        // A tick short of the delay must not have retried yet.
        vi.advanceTimersByTime(delay - 1)
        expect(sockets).toHaveLength(before)

        vi.advanceTimersByTime(1)
        expect(sockets).toHaveLength(before + 1)
      }
    })

    it('announces every failure, not just the first', () => {
      const seen: string[] = []
      handshake()
      client.onStatus(status => seen.push(status))

      for (const delay of [1_000, 2_000, 4_000]) {
        latest().serverClose(1011)
        vi.advanceTimersByTime(delay)
      }

      // The offline detector counts these, and the status string stops changing.
      expect(seen).toEqual(['reconnecting', 'reconnecting', 'reconnecting'])
    })

    it('resets the backoff once a handshake completes again', () => {
      handshake()

      latest().serverClose(1011)
      vi.advanceTimersByTime(1_000)
      latest().serverClose(1011)
      vi.advanceTimersByTime(2_000)

      // Third socket: complete the handshake, so the next drop starts at 1s again.
      latest().open()
      latest().receive(helloOk)
      expect(client.status).toBe('connected')

      latest().serverClose(1011)
      vi.advanceTimersByTime(999)
      expect(sockets).toHaveLength(3)
      vi.advanceTimersByTime(1)
      expect(sockets).toHaveLength(4)
    })

    it('re-sends hello on every reconnect, token included', () => {
      handshake('jwt-token')
      latest().serverClose(1011)
      vi.advanceTimersByTime(1_000)

      latest().open()
      expect(latest().frames[0]).toEqual({
        type: 'hello',
        protocolVersion: PROTOCOL_VERSION,
        token: 'jwt-token',
      })
    })
  })

  describe('stop', () => {
    it('closes the socket cleanly and never retries', () => {
      handshake()
      const socket = latest()

      client.stop()

      expect(client.status).toBe('stopped')
      expect(socket.closedWith?.code).toBe(1000)
      vi.advanceTimersByTime(120_000)
      expect(sockets).toHaveLength(1)
    })

    it('cancels a pending reconnect', () => {
      handshake()
      latest().serverClose(1011)
      expect(client.status).toBe('reconnecting')

      client.stop()
      vi.advanceTimersByTime(120_000)
      expect(sockets).toHaveLength(1)
      expect(client.status).toBe('stopped')
    })

    it('is safe with no socket at all', () => {
      expect(() => client.stop()).not.toThrow()
      expect(client.status).toBe('stopped')
    })

    it('connects again from scratch, back at the first backoff step', () => {
      handshake()
      client.stop()

      client.connect()
      expect(client.status).toBe('connecting')
      expect(sockets).toHaveLength(2)

      latest().serverClose(1011)
      vi.advanceTimersByTime(1_000)
      expect(sockets).toHaveLength(3)
    })

    it('reconnects after a 4401 halt when asked to', () => {
      handshake()
      latest().serverClose(CLOSE_CODES.unauthorized)
      expect(client.status).toBe('stopped')

      client.connect('fresh-token')
      expect(sockets).toHaveLength(2)
      latest().open()
      expect(latest().frames[0]).toMatchObject({ token: 'fresh-token' })
    })
  })
})
