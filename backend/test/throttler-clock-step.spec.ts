/**
 * Pins what a backwards wall-clock step does to the installed throttler's storage.
 *
 * express-rate-limit expired a window on wall-clock time, so a step backwards parked the reset
 * out of reach and the count never fell. @nestjs/throttler drains each hit on a setTimeout
 * instead, and Node timers are monotonic, so the same step cannot stop the count falling. The
 * ttls here are scaled down from the real 60s bucket so the suite can watch it happen.
 *
 * This file drives the library's storage, which the app no longer runs on: it runs on
 * PerClientThrottlerStorage, pinned in throttler-storage.spec.ts. Keeping the library pinned
 * here is what makes an upgrade's behaviour change visible.
 */
import { ThrottlerStorageService } from '@nestjs/throttler'
import { afterEach, describe, expect, it } from 'vitest'

import { HEALTH_THROTTLE } from '../src/config/throttling'

const TTL = 500
/**
 * How late a decrement timer may fire before three hits are alive at once, and the assertion
 * below fails on the suite's own scheduler rather than on anything the storage did wrong.
 */
const JITTER_MARGIN = 200
/**
 * Docker probes at roughly half the ttl, which is what keeps two hits alive at a time. Probing
 * at *exactly* half leaves no margin at all: hit k's decrement falls due the same instant probe
 * k+2 lands, at any ttl, so scaling the ttl up on its own buys nothing — measured, the gap sits
 * at 0ms whether the ttl is 100 or 2000. Probing half the margin later than half the ttl puts
 * each probe midway between the two deadlines that bracket it, and that gap is the tolerance.
 */
const PROBE = (TTL + JITTER_MARGIN) / 2
/** The incident: the clock was stepped back about an hour shortly after boot. */
const STEP_BACK = -60 * 60 * 1000

const realNow = Date.now.bind(Date)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const stepClock = (offset: number) => {
  Date.now = () => realNow() + offset
}

afterEach(() => {
  Date.now = realNow
})

describe('a backwards clock step against @nestjs/throttler storage', () => {
  it('does not stop the hit count falling, so the healthcheck pattern never blocks', async () => {
    const storage = new ThrottlerStorageService()
    const key = `health-${HEALTH_THROTTLE.name}`
    const seen: number[] = []

    // The container serves its first probe, opening the window...
    seen.push((await storage.increment(key, TTL, HEALTH_THROTTLE.limit, TTL, 'health')).totalHits)
    // ...and only then does the clock get stepped back, which is the ordering that mattered.
    stepClock(STEP_BACK)

    // Probing just over half the ttl keeps two hits alive at once and no more. More probes
    // than the bucket's limit, so a count that was climbing would certainly have blocked.
    for (let probe = 0; probe < HEALTH_THROTTLE.limit + 2; probe++) {
      await sleep(PROBE)
      const record = await storage.increment(key, TTL, HEALTH_THROTTLE.limit, TTL, 'health')
      seen.push(record.totalHits)
      expect(record.isBlocked).toBe(false)
    }

    expect(Math.max(...seen)).toBeLessThanOrEqual(2)
    storage.onApplicationShutdown()
  })

  // Why the library's unblocking was not good enough: it waits on Date.now(), so a step
  // backwards extends a live block by the offset. Our storage does not; see
  // throttler-storage.spec.ts, 'unblocks on schedule despite a backwards clock step'.
  it('does freeze a key that had already been blocked when the step landed', async () => {
    const storage = new ThrottlerStorageService()
    const limit = 3
    let record

    for (let hit = 0; hit <= limit; hit++) {
      record = await storage.increment('blocked', TTL, limit, TTL, 'other')
    }
    expect(record?.isBlocked).toBe(true)

    stepClock(STEP_BACK)
    await sleep(TTL * 4)
    const afterStep = await storage.increment('blocked', TTL, limit, TTL, 'other')
    expect(afterStep.isBlocked).toBe(true)

    storage.onApplicationShutdown()
  })

  it('unblocks on its own when the clock is left alone', async () => {
    const storage = new ThrottlerStorageService()
    const limit = 3

    for (let hit = 0; hit <= limit; hit++) {
      await storage.increment('control', TTL, limit, TTL, 'other')
    }

    await sleep(TTL * 4)
    expect((await storage.increment('control', TTL, limit, TTL, 'other')).isBlocked).toBe(false)
    storage.onApplicationShutdown()
  })
})
