import { describe, expect, it, vi } from 'vitest'

import { CachedQuery } from './cached-query'

/** A load that only settles when the test says so, for exercising the in-flight window. */
const deferred = <T> () => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('CachedQuery', () => {
  it('loads on the first call and reports it as a refresh', async () => {
    const load = vi.fn().mockResolvedValue(1)
    const cache = new CachedQuery(1000, load)

    expect(await cache.get(0)).toEqual({ value: 1, refreshed: true, failed: false })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('serves the cached value inside the TTL without reporting a refresh', async () => {
    const load = vi.fn().mockResolvedValue(1)
    const cache = new CachedQuery(1000, load)

    await cache.get(0)
    expect(await cache.get(999)).toEqual({ value: 1, refreshed: false, failed: false })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('reloads once the TTL has passed', async () => {
    const load = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2)
    const cache = new CachedQuery(1000, load)

    await cache.get(0)
    expect(await cache.get(1000)).toEqual({ value: 2, refreshed: true, failed: false })
    expect(load).toHaveBeenCalledTimes(2)
  })

  // The whole reason this class exists. Two scrapes arriving after expiry must not both run
  // an aggregation, least of all when the database is already the thing struggling.
  it('coalesces concurrent callers into one load', async () => {
    const gate = deferred<number>()
    const load = vi.fn().mockReturnValue(gate.promise)
    const cache = new CachedQuery(1000, load)

    const first = cache.get(0)
    const second = cache.get(0)
    gate.resolve(7)

    expect(await first).toEqual({ value: 7, refreshed: true, failed: false })
    expect(await second).toEqual({ value: 7, refreshed: true, failed: false })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('starts a fresh load once the shared one has settled', async () => {
    const load = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2)
    const cache = new CachedQuery(1000, load)

    await Promise.all([cache.get(0), cache.get(0)])
    await cache.get(5000)

    expect(load).toHaveBeenCalledTimes(2)
  })

  it('keeps the last good value when a load fails, and says it failed', async () => {
    const load = vi.fn().mockResolvedValueOnce(1).mockRejectedValueOnce(new Error('mongo is down'))
    const cache = new CachedQuery(1000, load)

    await cache.get(0)
    const outcome = await cache.get(2000)

    expect(outcome).toEqual({ value: 1, refreshed: false, failed: true })
  })

  it('reports null rather than a wrong number when the very first load fails', async () => {
    const load = vi.fn().mockRejectedValue(new Error('mongo is down'))
    const cache = new CachedQuery(1000, load)

    expect(await cache.get(0)).toEqual({ value: null, refreshed: false, failed: true })
  })

  it('recovers on the next call after a failure', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('mongo is down'))
      .mockResolvedValueOnce(3)
    const cache = new CachedQuery(1000, load)

    await cache.get(0)
    expect(await cache.get(1)).toEqual({ value: 3, refreshed: true, failed: false })
  })

  // A failed load must not be cached, or one blip would blank the panel for the whole TTL.
  it('retries immediately after a failure rather than caching it', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('blip'))
      .mockResolvedValueOnce(9)
    const cache = new CachedQuery(60_000, load)

    await cache.get(0)
    await cache.get(1)

    expect(load).toHaveBeenCalledTimes(2)
  })
})
