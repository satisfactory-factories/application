/**
 * Pins the storage the throttler guard actually runs on.
 *
 * @nestjs/throttler 6.5.0's own storage keeps one list of pending decrements per bucket with no
 * client key in it, and unblocking any client clears the whole list. Every other client in that
 * bucket then keeps its count for good, so an unrelated person can be 429'd out of signing in or
 * joining a room. PerClientThrottlerStorage gives each client its own timers and its own
 * monotonic deadlines; the last describe here holds the library to the behaviour we left behind,
 * so an upgrade that fixes it upstream is visible rather than silent.
 */
import { ThrottlerStorageService } from '@nestjs/throttler'
import type { ThrottlerStorage } from '@nestjs/throttler'
import { afterEach, describe, expect, it } from 'vitest'

import { PerClientThrottlerStorage } from '../src/config/throttler-storage'
import type { ThrottlerRecord } from '../src/config/throttler-storage'

/** Scaled down from the real buckets so the suite can watch a window open and close. */
const TTL = 600
const LIMIT = 2
const BUCKET = 'login'

const realNow = Date.now.bind(Date)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

afterEach(() => {
  Date.now = realNow
})

/**
 * Client A blocks and later unblocks. Client B makes two ordinary requests, at its limit but
 * never over it, while A is blocked. By the time B is measured both of its hits are older than
 * the ttl, so a storage that decays per client reports one live hit and no block.
 */
const oneClientUnblocksWhileAnotherIsCounting = async (
  storage: ThrottlerStorage,
): Promise<ThrottlerRecord> => {
  const hit = (key: string) => storage.increment(key, TTL, LIMIT, TTL, BUCKET)

  await hit('a')
  await hit('a')
  expect((await hit('a')).isBlocked).toBe(true)

  await sleep(550)
  await hit('b')
  expect((await hit('b')).totalHits).toBe(2)

  await sleep(150)
  expect((await hit('a')).isBlocked).toBe(false)

  await sleep(600)
  return hit('b')
}

describe('PerClientThrottlerStorage', () => {
  it('leaves another client counting normally when one unblocks', async () => {
    const storage = new PerClientThrottlerStorage()

    const b = await oneClientUnblocksWhileAnotherIsCounting(storage)

    expect(b.totalHits).toBe(1)
    expect(b.isBlocked).toBe(false)
    storage.onApplicationShutdown()
  })

  it('decays two clients in one bucket independently', async () => {
    const storage = new PerClientThrottlerStorage()
    const hit = (key: string) => storage.increment(key, TTL, LIMIT, TTL, BUCKET)

    await hit('a')
    await hit('a')
    await hit('b')
    await sleep(300)
    // Half a ttl on, both are still holding both hits.
    expect((await hit('a')).totalHits).toBe(3)
    expect((await hit('b')).totalHits).toBe(2)

    await sleep(700)
    // Past the ttl on everything above, so each client is back to just this request.
    expect((await hit('a')).totalHits).toBe(1)
    expect((await hit('b')).totalHits).toBe(1)
    storage.onApplicationShutdown()
  })

  it('lets a second client spend its whole allowance while the first is blocked', async () => {
    const storage = new PerClientThrottlerStorage()
    const hit = (key: string) => storage.increment(key, TTL, LIMIT, TTL, BUCKET)

    await hit('a')
    await hit('a')
    expect((await hit('a')).isBlocked).toBe(true)

    for (let attempt = 0; attempt < LIMIT; attempt++) {
      expect((await hit('b')).isBlocked).toBe(false)
    }
    // B blocks on its own hit past its own limit, and on nothing A did.
    expect((await hit('b')).isBlocked).toBe(true)
    storage.onApplicationShutdown()
  })

  it('decays several buckets at once', async () => {
    const storage = new PerClientThrottlerStorage()
    // The real generateKey is `${throttlerName}-${tracker}`, so one client holds one key per
    // bucket it touches.
    const hit = (bucket: string) => storage.increment(`${bucket}-a`, TTL, LIMIT, TTL, bucket)

    await hit('login')
    await hit('share')
    await hit('login')
    expect((await hit('share')).totalHits).toBe(2)

    await sleep(TTL + 200)
    expect((await hit('login')).totalHits).toBe(1)
    expect((await hit('share')).totalHits).toBe(1)
    storage.onApplicationShutdown()
  })

  it('reports the record the guard reads, and blocks on the hit past the limit', async () => {
    const storage = new PerClientThrottlerStorage()
    const hit = () => storage.increment('k', 1000, LIMIT, 1000, BUCKET)

    const first = await hit()
    expect(first.totalHits).toBe(1)
    expect(first.timeToExpire).toBe(1)
    expect(first.isBlocked).toBe(false)

    expect((await hit()).isBlocked).toBe(false)

    const blocked = await hit()
    expect(blocked.totalHits).toBe(LIMIT + 1)
    expect(blocked.isBlocked).toBe(true)
    // Retry-After comes from this, in whole seconds.
    expect(blocked.timeToBlockExpire).toBe(1)

    // Still blocked while the block is live, and not counting further hits against itself.
    const during = await hit()
    expect(during.isBlocked).toBe(true)
    expect(during.totalHits).toBe(LIMIT + 1)

    await sleep(1100)
    const after = await hit()
    expect(after.isBlocked).toBe(false)
    expect(after.totalHits).toBe(1)
    storage.onApplicationShutdown()
  })

  it('unblocks on schedule despite a backwards clock step', async () => {
    const storage = new PerClientThrottlerStorage()
    const hit = () => storage.increment('stepped', TTL, LIMIT, TTL, BUCKET)

    for (let attempt = 0; attempt <= LIMIT; attempt++) await hit()
    expect((await hit()).isBlocked).toBe(true)

    // The incident: the clock stepped back about an hour, shortly after boot.
    Date.now = () => realNow() - 60 * 60 * 1000
    await sleep(TTL + 200)

    expect((await hit()).isBlocked).toBe(false)
    storage.onApplicationShutdown()
  })

  it('drops its pending decrements on shutdown', async () => {
    const storage = new PerClientThrottlerStorage()

    await storage.increment('k', 100, LIMIT, 100, BUCKET)
    storage.onApplicationShutdown()
    // Nothing left to fire into a torn-down app, and a second call is safe.
    await sleep(200)
    storage.onApplicationShutdown()

    expect((await storage.increment('k', 100, LIMIT, 100, BUCKET)).totalHits).toBe(1)
    storage.onApplicationShutdown()
  })
})

describe('the library storage this replaces', () => {
  // Held to the defect deliberately. If this ever fails, @nestjs/throttler has fixed the
  // cross-client cancellation and PerClientThrottlerStorage is worth re-reading against it.
  it('strands a second client when the first unblocks', async () => {
    const storage = new ThrottlerStorageService()

    const b = await oneClientUnblocksWhileAnotherIsCounting(storage)

    // Both of B's earlier hits should have decayed. They were cancelled by A's unblock instead,
    // so an ordinary third request pushes B over a limit it never actually exceeded.
    expect(b.totalHits).toBe(LIMIT + 1)
    expect(b.isBlocked).toBe(true)
    storage.onApplicationShutdown()
  })
})
