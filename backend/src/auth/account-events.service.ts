import { EventEmitter } from 'node:events'

import { Injectable } from '@nestjs/common'

import { EventCountersService } from '../event-counters/event-counters.service'

export interface AccountEventMap {
  /** Every token minted for this account before now is dead; its sockets must close. */
  account_tokens_revoked: { userId: string }
}

export type AccountEventName = keyof AccountEventMap
export type AccountEventListener<K extends AccountEventName> = (payload: AccountEventMap[K]) => void

/**
 * The account half of the in-process fan-out bus. Separate from `RoomEventsService`
 * rather than a second event on it: the rooms domain already imports auth, so an auth
 * service emitting on the rooms bus would put a cycle in the module graph.
 */
@Injectable()
export class AccountEventsService {
  private readonly emitter = new EventEmitter()

  constructor (private readonly counters: EventCountersService) {
    this.emitter.setMaxListeners(0)
  }

  // A listener must never be able to fail the password change that notified it.
  emit<K extends AccountEventName> (name: K, payload: AccountEventMap[K]): void {
    try {
      this.emitter.emit(name, payload)
    } catch (error) {
      console.error(`Account event listener threw on ${name}:`, error)
      this.counters.record('server', 'account_event_listener_threw')
    }
  }

  on<K extends AccountEventName> (name: K, listener: AccountEventListener<K>): void {
    this.emitter.on(name, listener)
  }

  off<K extends AccountEventName> (name: K, listener: AccountEventListener<K>): void {
    this.emitter.off(name, listener)
  }
}
