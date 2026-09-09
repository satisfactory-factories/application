import { performance } from 'node:perf_hooks'

import { Injectable } from '@nestjs/common'
import type { OnApplicationShutdown } from '@nestjs/common'
import type { ThrottlerStorage } from '@nestjs/throttler'

/** The library does not re-export this from its entrypoint, so take it off the interface. */
export type ThrottlerRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>

interface ClientRecord {
  /** Live hits, per bucket. A key only ever carries one bucket under our generateKey. */
  hits: Map<string, number>
  /** The pending decrement for each of those hits, held on the client rather than the bucket. */
  timers: Map<string, NodeJS.Timeout[]>
  expiresAt: number
  blockExpiresAt: number
  isBlocked: boolean
}

/**
 * Monotonic, so a wall-clock step cannot move a deadline already set. Floored to whole
 * milliseconds like Date.now(): performance.now() is fractional, and the float residue in
 * `at + ttl - at` was enough to round a reported window up by a second.
 */
const now = (): number => Math.floor(performance.now())

const toSeconds = (milliseconds: number): number => Math.ceil(milliseconds / 1000)

/**
 * In-memory throttler storage, replacing @nestjs/throttler 6.5.0's ThrottlerStorageService.
 *
 * Two defects in that implementation put real clients at risk, and both are structural rather
 * than tunable:
 *
 * 1. It tracks pending decrements in one list per bucket with no client key, and unblocking any
 *    one client clears the whole list. Every other client in that bucket then keeps its count
 *    forever, so repeated block-and-unblock cycles on `login` or `roomAuth` lock out strangers
 *    who did nothing. Here each client owns its own timers, so an unblock touches nobody else.
 * 2. Unblocking compared `blockExpiresAt` against `Date.now()`, so a backwards clock step
 *    extended every live block by the offset. Every deadline here is monotonic instead.
 *
 * Everything the guard reads is unchanged: totalHits, timeToExpire and timeToBlockExpire in
 * whole seconds, isBlocked, blocking on the hit that passes the limit, and the window refreshing
 * once it has lapsed.
 */
@Injectable()
export class PerClientThrottlerStorage implements ThrottlerStorage, OnApplicationShutdown {
  private readonly clients = new Map<string, ClientRecord>()

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerRecord> {
    const at = now()
    const client = this.clientFor(key, throttlerName, at, ttl)

    if (client.expiresAt <= at) client.expiresAt = at + ttl
    const timeToExpire = toSeconds(client.expiresAt - at)

    if (!client.isBlocked) this.countHit(client, throttlerName, ttl)

    if (!client.isBlocked && (client.hits.get(throttlerName) ?? 0) > limit) {
      client.isBlocked = true
      client.blockExpiresAt = at + blockDuration
    }

    // Negative for a client that has never blocked, as in the library. The guard only reads it
    // to set Retry-After, which it only does while isBlocked.
    const timeToBlockExpire = toSeconds(client.blockExpiresAt - at)
    if (client.isBlocked && client.blockExpiresAt <= at) {
      this.unblock(client, throttlerName)
      this.countHit(client, throttlerName, ttl)
    }

    return {
      totalHits: client.hits.get(throttlerName) ?? 0,
      timeToExpire,
      isBlocked: client.isBlocked,
      timeToBlockExpire,
    }
  }

  onApplicationShutdown(): void {
    for (const client of this.clients.values()) {
      for (const timers of client.timers.values()) timers.forEach(clearTimeout)
      client.timers.clear()
    }
    this.clients.clear()
  }

  private clientFor(key: string, throttlerName: string, at: number, ttl: number): ClientRecord {
    const existing = this.clients.get(key)
    if (existing) {
      if (!existing.hits.has(throttlerName)) existing.hits.set(throttlerName, 0)
      return existing
    }

    const client: ClientRecord = {
      hits: new Map([[throttlerName, 0]]),
      timers: new Map(),
      expiresAt: at + ttl,
      blockExpiresAt: 0,
      isBlocked: false,
    }
    this.clients.set(key, client)
    return client
  }

  private countHit(client: ClientRecord, throttlerName: string, ttl: number): void {
    client.hits.set(throttlerName, (client.hits.get(throttlerName) ?? 0) + 1)

    const timer = setTimeout(() => {
      client.hits.set(throttlerName, Math.max(0, (client.hits.get(throttlerName) ?? 0) - 1))
      const pending = client.timers.get(throttlerName)
      if (pending) client.timers.set(throttlerName, pending.filter(id => id !== timer))
    }, ttl)

    client.timers.set(throttlerName, [...(client.timers.get(throttlerName) ?? []), timer])
  }

  /** Cancels this client's pending decrements and nobody else's, which is the whole fix. */
  private unblock(client: ClientRecord, throttlerName: string): void {
    client.isBlocked = false
    client.hits.set(throttlerName, 0)
    client.timers.get(throttlerName)?.forEach(clearTimeout)
    client.timers.set(throttlerName, [])
  }
}
