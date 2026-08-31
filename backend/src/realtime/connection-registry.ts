import { Injectable } from '@nestjs/common'
import type WebSocket from 'ws'

import { Connection } from './connection'

/** Three indexes over the live sockets: by socket, by account, by room. */
@Injectable()
export class ConnectionRegistry {
  private readonly bySocket = new Map<WebSocket, Connection>()
  private readonly byUser = new Map<string, Set<Connection>>()
  private readonly byRoom = new Map<string, Set<Connection>>()

  add (connection: Connection): void {
    this.bySocket.set(connection.socket, connection)
  }

  get (socket: WebSocket): Connection | undefined {
    return this.bySocket.get(socket)
  }

  /** Called once `hello` establishes an account, so fan-out can reach the user. */
  registerUser (connection: Connection): void {
    if (connection.userId === null) return
    addTo(this.byUser, connection.userId, connection)
  }

  /**
   * True only when this socket was not already in the room. A client re-joins to
   * probe its revision, and presence has not changed for any of those.
   */
  joinRoom (connection: Connection, roomId: string): boolean {
    const existing = this.byRoom.get(roomId)
    if (!existing) {
      this.byRoom.set(roomId, new Set([connection]))
      return true
    }
    if (existing.has(connection)) return false
    existing.add(connection)
    return true
  }

  leaveRoom (connection: Connection, roomId: string): void {
    removeFrom(this.byRoom, roomId, connection)
    connection.rooms.delete(roomId)
  }

  remove (connection: Connection): void {
    this.bySocket.delete(connection.socket)
    if (connection.userId !== null) removeFrom(this.byUser, connection.userId, connection)
    for (const roomId of connection.rooms.keys()) removeFrom(this.byRoom, roomId, connection)
    connection.rooms.clear()
  }

  roomConnections (roomId: string): Connection[] {
    return [...(this.byRoom.get(roomId) ?? [])]
  }

  userConnections (userId: string): Connection[] {
    return [...(this.byUser.get(userId) ?? [])]
  }

  presence (roomId: string): number {
    return this.byRoom.get(roomId)?.size ?? 0
  }

  all (): Connection[] {
    return [...this.bySocket.values()]
  }
}

const addTo = (index: Map<string, Set<Connection>>, key: string, connection: Connection): void => {
  const existing = index.get(key)
  if (existing) existing.add(connection)
  else index.set(key, new Set([connection]))
}

const removeFrom = (index: Map<string, Set<Connection>>, key: string, connection: Connection): void => {
  const existing = index.get(key)
  if (!existing) return
  existing.delete(connection)
  if (existing.size === 0) index.delete(key)
}
