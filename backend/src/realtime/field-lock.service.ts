import { Inject, Injectable } from '@nestjs/common'
import { CAPS, FIELD_LOCK_TTL_MS } from 'common'
import type { FieldLock } from 'common'

import { CLOCK, Clock } from '../rooms/clock'
import { Connection } from './connection'

interface LockEntry {
  connection: Connection
  expiresAt: number
}

/**
 * Who is editing which input, per room. Advisory only: nothing on the op path reads
 * these, so the worst a wrong answer costs is a disabled field. Field keys are opaque
 * strings the client mints, capped in length and in number per socket.
 *
 * Expiry is lazy plus a sweep on the gateway's heartbeat, so no timer is held per lock.
 */
@Injectable()
export class FieldLockService {
  private readonly byRoom = new Map<string, Map<string, LockEntry>>()
  private readonly byConnection = new Map<Connection, Map<string, Set<string>>>()

  constructor (@Inject(CLOCK) private readonly clock: Clock) {}

  /**
   * Claim the field, or renew a claim this socket already holds. Returns whether the
   * room's locks changed: a renewal moves nothing anyone can see, and a field somebody
   * else holds is refused by simply not granting it — the broadcast already said so.
   */
  claim (roomId: string, fieldKey: string, connection: Connection): boolean {
    const now = this.now()
    const held = this.liveEntry(roomId, fieldKey, now)

    if (held) {
      if (held.connection !== connection) return false
      held.expiresAt = now + FIELD_LOCK_TTL_MS
      return false
    }

    if (this.countOf(connection) >= CAPS.fieldLocksPerConnection) return false

    this.index(roomId, fieldKey, connection)
    this.locksOf(roomId).set(fieldKey, { connection, expiresAt: now + FIELD_LOCK_TTL_MS })
    return true
  }

  /** Blur. Someone else's lock is not this socket's to release. */
  unlock (roomId: string, fieldKey: string, connection: Connection): boolean {
    const entry = this.byRoom.get(roomId)?.get(fieldKey)
    if (!entry || entry.connection !== connection) return false
    this.drop(roomId, fieldKey)
    return true
  }

  /** One socket's locks in one room: leave, a kick, or an access check that refused. */
  release (roomId: string, connection: Connection): boolean {
    const keys = this.byConnection.get(connection)?.get(roomId)
    if (!keys || keys.size === 0) return false
    for (const fieldKey of [...keys]) this.drop(roomId, fieldKey)
    return true
  }

  /** Disconnect. Returns the rooms that need telling. */
  releaseConnection (connection: Connection): string[] {
    const rooms = this.byConnection.get(connection)
    if (!rooms) return []

    const roomIds = [...rooms.keys()]
    for (const roomId of roomIds) this.release(roomId, connection)
    return roomIds
  }

  /** A tombstoned room: nobody is told, the room simply stops existing. */
  releaseRoom (roomId: string): void {
    const locks = this.byRoom.get(roomId)
    if (!locks) return
    for (const fieldKey of [...locks.keys()]) this.drop(roomId, fieldKey)
  }

  /** Drops every lock nobody renewed. Returns the rooms that need telling. */
  sweep (): string[] {
    const now = this.now()
    const changed: string[] = []

    for (const [roomId, locks] of this.byRoom) {
      const expired = [...locks].filter(([, entry]) => entry.expiresAt <= now).map(([key]) => key)
      if (expired.length === 0) continue
      for (const fieldKey of expired) this.drop(roomId, fieldKey)
      changed.push(roomId)
    }

    return changed
  }

  /** The room's live locks, expired ones dropped on the way past. */
  locks (roomId: string): FieldLock[] {
    const locks = this.byRoom.get(roomId)
    if (!locks) return []

    const now = this.now()
    for (const [fieldKey, entry] of [...locks]) {
      if (entry.expiresAt <= now) this.drop(roomId, fieldKey)
    }

    return [...(this.byRoom.get(roomId) ?? [])]
      .map(([fieldKey, entry]) => ({ fieldKey, holder: entry.connection.id }))
  }

  private now (): number {
    return this.clock.now().getTime()
  }

  private liveEntry (roomId: string, fieldKey: string, now: number): LockEntry | null {
    const entry = this.byRoom.get(roomId)?.get(fieldKey)
    if (!entry) return null
    if (entry.expiresAt > now) return entry
    this.drop(roomId, fieldKey)
    return null
  }

  private countOf (connection: Connection): number {
    let count = 0
    for (const keys of this.byConnection.get(connection)?.values() ?? []) count += keys.size
    return count
  }

  private locksOf (roomId: string): Map<string, LockEntry> {
    const existing = this.byRoom.get(roomId)
    if (existing) return existing
    const created = new Map<string, LockEntry>()
    this.byRoom.set(roomId, created)
    return created
  }

  private index (roomId: string, fieldKey: string, connection: Connection): void {
    let rooms = this.byConnection.get(connection)
    if (!rooms) {
      rooms = new Map()
      this.byConnection.set(connection, rooms)
    }
    const keys = rooms.get(roomId)
    if (keys) keys.add(fieldKey)
    else rooms.set(roomId, new Set([fieldKey]))
  }

  /** Both indexes, always together: a socket's count is what the cap is read from. */
  private drop (roomId: string, fieldKey: string): void {
    const locks = this.byRoom.get(roomId)
    const entry = locks?.get(fieldKey)
    if (!locks || !entry) return

    locks.delete(fieldKey)
    if (locks.size === 0) this.byRoom.delete(roomId)

    const rooms = this.byConnection.get(entry.connection)
    const keys = rooms?.get(roomId)
    if (!rooms || !keys) return

    keys.delete(fieldKey)
    if (keys.size === 0) rooms.delete(roomId)
    if (rooms.size === 0) this.byConnection.delete(entry.connection)
  }
}
