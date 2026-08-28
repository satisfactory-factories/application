import { CLOSE_CODES, PROTOCOL_VERSION } from 'common'
import type { ClientHelloMessage, ClientMessage, RoomDiff, ServerMessage } from 'common'
import { config } from '@/config/config'
import eventBus from '@/utils/eventBus'

/** The gateway shares the API's port and answers on this path only. */
export const WS_PATH = '/ws'

/** Normal closure: what we send when we are the ones hanging up. */
const NORMAL_CLOSURE = 1000

const SOCKET_OPEN = 1

/** 1s, 2s, 4s … capped at 30s, reset the moment a handshake completes. */
export const RECONNECT_BASE_MS = 1_000
export const RECONNECT_CAP_MS = 30_000

export const reconnectDelay = (attempt: number): number =>
  Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_CAP_MS)

/** `stopped` is deliberate: `stop()`, or a close code that forbids retrying. */
export type SyncSocketStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'stopped' | 'version_mismatch'

/**
 * The slice of `WebSocket` this client drives. Handler properties rather than
 * `addEventListener` so a test double is a dozen lines.
 */
export interface WebSocketLike {
  readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: { code: number, reason?: string }) => void) | null
  onerror: ((event: unknown) => void) | null
}

export interface SyncSocketOptions {
  /** Defaults to the API origin with the http(s) scheme swapped for ws(s). */
  url?: string
  socketFactory?: (url: string) => WebSocketLike
}

export interface JoinOptions {
  /** The revision already held; the server answers `up_to_date` when it matches. */
  lastRevision?: number
  /** Anonymous visitors must re-send this on every join of that room. */
  visitorToken?: string
}

export interface OutgoingOp {
  roomId: string
  opId: string
  baseRevision: number
  diff: RoomDiff
}

export const syncSocketUrl = (apiUrl: string = config.apiUrl): string => {
  const url = new URL(WS_PATH, apiUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

const defaultSocketFactory = (url: string): WebSocketLike =>
  new WebSocket(url) as unknown as WebSocketLike

/**
 * The transport, and only the transport: one socket, the hello handshake, the
 * close-code policy and the backoff. It holds no room state — after a reconnect
 * the owner re-joins, because only it knows each tab's revision and visitor
 * token. Nothing Vue or Pinia belongs in here.
 */
export class SyncSocket {
  private readonly url: string
  private readonly socketFactory: (url: string) => WebSocketLike

  private socket: WebSocketLike | null = null
  private token: string | undefined
  private attempt = 0
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private halted = true
  private statusValue: SyncSocketStatus = 'idle'

  private readonly messageHandlers = new Set<(message: ServerMessage) => void>()
  private readonly statusHandlers = new Set<(status: SyncSocketStatus) => void>()

  /** The code of the last close, for diagnostics and the account tile. */
  lastCloseCode: number | null = null

  constructor (options: SyncSocketOptions = {}) {
    this.url = options.url ?? syncSocketUrl()
    this.socketFactory = options.socketFactory ?? defaultSocketFactory
  }

  get status (): SyncSocketStatus {
    return this.statusValue
  }

  get isConnected (): boolean {
    return this.statusValue === 'connected'
  }

  // ===== Subscriptions =====

  onMessage (handler: (message: ServerMessage) => void): () => void {
    this.messageHandlers.add(handler)
    return () => this.messageHandlers.delete(handler)
  }

  onStatus (handler: (status: SyncSocketStatus) => void): () => void {
    this.statusHandlers.add(handler)
    return () => this.statusHandlers.delete(handler)
  }

  // ===== Lifecycle =====

  /** Idempotent: calling it while already connected only refreshes the token. */
  connect (token?: string): void {
    this.token = token
    this.halted = false
    if (this.socket || this.retryTimer) return
    // Nothing pending means this is a fresh start, including after a 4401 halt.
    this.attempt = 0
    this.open()
  }

  /**
   * Hard stop. No reconnect until `connect()` is called again, which is exactly
   * what offline mode needs: total silence, not quieter retrying.
   */
  stop (): void {
    this.halted = true
    this.attempt = 0
    this.clearRetry()
    this.closeSocket(NORMAL_CLOSURE, 'client stopped')
    this.setStatus('stopped')
  }

  // ===== Sending =====

  /** False when the socket is not open; the caller re-sends on `connected`. */
  send (message: ClientMessage): boolean {
    if (!this.socket || this.socket.readyState !== SOCKET_OPEN) return false
    this.socket.send(JSON.stringify(message))
    return true
  }

  join (roomId: string, options: JoinOptions = {}): boolean {
    return this.send({
      type: 'join',
      roomId,
      lastRevision: options.lastRevision,
      visitorToken: options.visitorToken,
    })
  }

  leave (roomId: string): boolean {
    return this.send({ type: 'leave', roomId })
  }

  sendOp (op: OutgoingOp): boolean {
    return this.send({ type: 'op', ...op })
  }

  // ===== Internals =====

  private open (): void {
    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting')

    const socket = this.socketFactory(this.url)
    this.socket = socket

    socket.onopen = () => {
      const hello: ClientHelloMessage = { type: 'hello', protocolVersion: PROTOCOL_VERSION }
      if (this.token) hello.token = this.token
      socket.send(JSON.stringify(hello))
    }
    socket.onmessage = event => this.handleMessage(event.data)
    socket.onclose = event => this.handleClose(event?.code ?? NORMAL_CLOSURE)
    // A socket error is always followed by a close, which is where the policy lives.
    socket.onerror = () => {}
  }

  private handleMessage (data: unknown): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(typeof data === 'string' ? data : String(data))
    } catch {
      return
    }
    if (typeof parsed !== 'object' || parsed === null) return

    const message = parsed as ServerMessage
    if (typeof message.type !== 'string') return

    if (message.type === 'hello_ok') {
      this.attempt = 0
      this.setStatus('connected')
    }

    for (const handler of [...this.messageHandlers]) handler(message)
  }

  private handleClose (code: number): void {
    this.socket = null
    this.lastCloseCode = code

    if (this.halted) return

    switch (code) {
      // No token, or access to every room in this socket is gone. Retrying cannot help.
      case CLOSE_CODES.unauthorized:
      case CLOSE_CODES.forbidden:
        this.halted = true
        this.setStatus('stopped')
        return

      case CLOSE_CODES.versionMismatch:
        this.halted = true
        this.setStatus('version_mismatch')
        eventBus.emit('versionMismatch', { source: 'ws' })
        return

      default:
        this.scheduleReconnect()
    }
  }

  private scheduleReconnect (): void {
    this.clearRetry()
    const delay = reconnectDelay(this.attempt)
    this.attempt++
    // Announced every time, not just on the first: each failure is what the
    // offline detector counts, and the status string stops changing after one.
    this.statusValue = 'reconnecting'
    this.notify('reconnecting')

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      if (!this.halted) this.open()
    }, delay)
  }

  private clearRetry (): void {
    if (this.retryTimer === null) return
    clearTimeout(this.retryTimer)
    this.retryTimer = null
  }

  private closeSocket (code: number, reason: string): void {
    const socket = this.socket
    this.socket = null
    if (!socket) return

    socket.onopen = null
    socket.onmessage = null
    socket.onclose = null
    socket.onerror = null
    try {
      socket.close(code, reason)
    } catch {
      // A socket already closing throws in some browsers; nothing to recover.
    }
  }

  private setStatus (status: SyncSocketStatus): void {
    if (this.statusValue === status) return
    this.statusValue = status
    this.notify(status)
  }

  private notify (status: SyncSocketStatus): void {
    for (const handler of [...this.statusHandlers]) handler(status)
  }
}
