import { WS_CONNECTION_LIMIT, WS_CONNECTION_WINDOW_MS } from './realtime.constants'

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
 * Module-level because `verifyClient` is baked into the gateway's decorator
 * metadata and so cannot reach the DI container. Tests reset it between suites,
 * which all connect from the same loopback address.
 */
export const wsConnectionLimiter = new KeyedFixedWindow(WS_CONNECTION_LIMIT, WS_CONNECTION_WINDOW_MS)
