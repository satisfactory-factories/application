import {
  WS_CONNECTION_LIMIT,
  WS_CONNECTION_WINDOW_MS,
  WS_MAX_SOCKETS,
  WS_MAX_SOCKETS_PER_IP,
} from './realtime.constants'

/** Above this many tracked keys, expired windows are swept on the next check. */
const PRUNE_THRESHOLD = 1_000

/** Fixed window rather than a token bucket: a boundary only ever favours the client. */
export class FixedWindow {
  private start = 0
  private count = 0

  constructor (private readonly limit: number, private readonly windowMs: number) {}

  allow (now = Date.now()): boolean {
    if (now - this.start >= this.windowMs) {
      this.start = now
      this.count = 0
    }
    this.count += 1
    return this.count <= this.limit
  }
}

/** The same window per key, with lazy eviction so a long-lived process cannot leak. */
export class KeyedFixedWindow {
  private readonly entries = new Map<string, { start: number, count: number }>()

  constructor (private readonly limit: number, private readonly windowMs: number) {}

  allow (key: string, now = Date.now()): boolean {
    if (this.entries.size > PRUNE_THRESHOLD) this.prune(now)

    const entry = this.entries.get(key)
    if (!entry || now - entry.start >= this.windowMs) {
      this.entries.set(key, { start: now, count: 1 })
      return true
    }

    entry.count += 1
    return entry.count <= this.limit
  }

  reset (): void {
    this.entries.clear()
  }

  private prune (now: number): void {
    for (const [key, entry] of this.entries) {
      if (now - entry.start >= this.windowMs) this.entries.delete(key)
    }
  }
}

/**
 * Sockets alive right now, per address and in total. A rate limit bounds how fast they
 * arrive and says nothing about how many are held, so this is the half that stops one
 * address from simply keeping every socket it opens.
 */
export class ConcurrencyLimiter {
  private readonly perKey = new Map<string, number>()
  private live = 0

  constructor (private readonly perKeyLimit: number, private readonly totalLimit: number) {}

  /** Takes a slot, or refuses. A refusal takes nothing, so it needs no release. */
  acquire (key: string): boolean {
    const held = this.perKey.get(key) ?? 0
    if (this.live >= this.totalLimit || held >= this.perKeyLimit) return false

    this.perKey.set(key, held + 1)
    this.live += 1
    return true
  }

  release (key: string): void {
    const held = this.perKey.get(key)
    if (held === undefined) return

    if (held <= 1) this.perKey.delete(key)
    else this.perKey.set(key, held - 1)
    this.live = Math.max(0, this.live - 1)
  }

  size (): number {
    return this.live
  }

  reset (): void {
    this.perKey.clear()
    this.live = 0
  }
}

/**
 * Module-level because `verifyClient` is baked into the gateway's decorator
 * metadata and so cannot reach the DI container. Tests reset them between suites,
 * which all connect from the same loopback address.
 */
export const wsConnectionLimiter = new KeyedFixedWindow(WS_CONNECTION_LIMIT, WS_CONNECTION_WINDOW_MS)
export const wsConcurrencyLimiter = new ConcurrencyLimiter(WS_MAX_SOCKETS_PER_IP, WS_MAX_SOCKETS)
