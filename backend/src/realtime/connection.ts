import { randomUUID } from 'node:crypto'

import WebSocket from 'ws'
import type { ServerMessage } from 'common'

import {
  WS_MAX_BUFFERED_BYTES,
  WS_MESSAGE_LIMIT,
  WS_MESSAGE_WINDOW_MS,
  WS_TRY_AGAIN_LATER,
} from './realtime.constants'
import { FixedWindow } from './ws-throttle'

/** What one socket knows about one room it has joined. */
export interface RoomSession {
  roomId: string
  /** Kept so every op re-checks the token against the room's current passwordVersion. */
  visitorToken?: string
}

/** One socket's protocol state. Rooms are multiplexed over it. */
export class Connection {
  /** Handed out in `hello_ok` and stamped on every field lock this socket holds. */
  readonly id = randomUUID()
  readonly rooms = new Map<string, RoomSession>()
  userId: string | null = null
  username: string | null = null
  helloDone = false
  isAlive = true
  helloTimer: NodeJS.Timeout | null = null

  private closed = false
  private readonly messages = new FixedWindow(WS_MESSAGE_LIMIT, WS_MESSAGE_WINDOW_MS)

  constructor (readonly socket: WebSocket, readonly ip: string) {}

  allowMessage (): boolean {
    return this.messages.allow()
  }

  send (message: ServerMessage): void {
    if (this.socket.readyState !== WebSocket.OPEN) return
    // Snapshots are large and the process is single: a client that cannot drain
    // is dropped rather than allowed to grow the heap without bound.
    if (this.socket.bufferedAmount > WS_MAX_BUFFERED_BYTES) {
      this.close(WS_TRY_AGAIN_LATER, 'send queue overflow')
      return
    }
    this.socket.send(JSON.stringify(message))
  }

  close (code: number, reason: string): void {
    if (this.closed) return
    this.closed = true
    this.clearHelloTimer()
    this.socket.close(code, reason)
  }

  terminate (): void {
    this.closed = true
    this.clearHelloTimer()
    this.socket.terminate()
  }

  ping (): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.ping()
  }

  clearHelloTimer (): void {
    if (this.helloTimer === null) return
    clearTimeout(this.helloTimer)
    this.helloTimer = null
  }
}
