import { EventEmitter } from 'node:events'

import { Injectable } from '@nestjs/common'

/** Who an access change kicks: password holders, or everyone but the owner. */
export type RoomAccessScope = 'visitors' | 'non-owners'

export interface RoomEventMap {
  /** These users' room lists changed; their `roomsRevision` has already been bumped. */
  rooms_changed: { userIds: string[] }
  /** The room's name/slug/shared/hasPassword changed. */
  room_meta: { roomId: string }
  /** The room is tombstoned; everyone holding it turns their copy local. */
  room_deleted: { roomId: string }
  /** Sockets in this scope must be re-checked and closed 4403 if they no longer qualify. */
  access_revoked: { roomId: string, scope: RoomAccessScope }
}

export type RoomEventName = keyof RoomEventMap
export type RoomEventListener<K extends RoomEventName> = (payload: RoomEventMap[K]) => void

/**
 * The in-process fan-out bus the WS gateway subscribes to. Typed rather than
 * `@nestjs/event-emitter`'s string keys, because every consumer is in this repo
 * and a mistyped event name should not compile.
 */
@Injectable()
export class RoomEventsService {
  private readonly emitter = new EventEmitter()

  constructor () {
    this.emitter.setMaxListeners(0)
  }

  // A listener must never be able to fail a REST request that only notified it.
  emit<K extends RoomEventName> (name: K, payload: RoomEventMap[K]): void {
    try {
      this.emitter.emit(name, payload)
    } catch (error) {
      console.error(`Room event listener threw on ${name}:`, error)
    }
  }

  on<K extends RoomEventName> (name: K, listener: RoomEventListener<K>): void {
    this.emitter.on(name, listener)
  }

  off<K extends RoomEventName> (name: K, listener: RoomEventListener<K>): void {
    this.emitter.off(name, listener)
  }
}
