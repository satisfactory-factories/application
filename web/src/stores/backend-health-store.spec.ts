import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import * as api from '@/api/client'
import { ApiError, ApiNetworkError } from '@/api/client'
import {
  HEALTH_BACKOFF_MAX_MS,
  HEALTH_POLL_MS,
  HEALTH_RETRY_ATTEMPTS,
  HEALTH_RETRY_MS,
  useBackendHealthStore,
} from '@/stores/backend-health-store'
import { useRoomSyncStore } from '@/stores/room-sync-store'

vi.mock('@/api/client', async importOriginal => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return { ...actual, getHealth: vi.fn() }
})

const healthy = { status: 'ok' as const, uptime: 10, database: { status: 'ok' as const, state: 'connected', responseTime: 1 } }
const failing = { status: 'fail' as const, uptime: 10, database: { status: 'fail' as const, state: 'disconnected', responseTime: 3000 } }

describe('backend-health-store', () => {
  let store: ReturnType<typeof useBackendHealthStore>
  let roomSync: ReturnType<typeof useRoomSyncStore>

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    setActivePinia(createPinia())
    roomSync = useRoomSyncStore()
    store = useBackendHealthStore()
    vi.mocked(api.getHealth).mockResolvedValue(healthy)
  })

  afterEach(() => {
    store.dispose()
    roomSync.dispose()
    // The navigator.onLine spy below would otherwise outlive its test and silently convince
    // every later one that the browser, rather than the server, is the thing that is down.
    vi.restoreAllMocks()
  })

  it('says nothing while the server answers', async () => {
    await store.check()

    expect(store.unhealthy).toBe(false)
  })

  it('raises on a 503, and clears again when the server recovers', async () => {
    vi.mocked(api.getHealth).mockRejectedValueOnce(new ApiError(503, 'Service Unavailable', failing))
    await store.check()
    expect(store.unhealthy).toBe(true)

    vi.mocked(api.getHealth).mockResolvedValue(healthy)
    await store.check()
    expect(store.unhealthy).toBe(false)
  })

  it('raises on a body that says it failed even with a 200', async () => {
    vi.mocked(api.getHealth).mockResolvedValue(failing)

    await store.check()

    expect(store.unhealthy).toBe(true)
  })

  it('raises when the request never lands at all', async () => {
    vi.mocked(api.getHealth).mockRejectedValue(new ApiNetworkError('no route to host'))

    await store.check()

    expect(store.unhealthy).toBe(true)
  })

  it('blames nothing on the server when the browser itself has no network', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    vi.mocked(api.getHealth).mockRejectedValue(new ApiNetworkError('offline'))

    await store.check()

    expect(store.unhealthy).toBe(false)
  })

  it('asks nothing at all in offline mode, and drops what it thought it knew', async () => {
    vi.mocked(api.getHealth).mockResolvedValue(failing)
    await store.check()
    expect(store.unhealthy).toBe(true)

    roomSync.enterOffline()
    await nextTick()
    vi.mocked(api.getHealth).mockClear()

    await store.check()

    expect(api.getHealth).not.toHaveBeenCalled()
    expect(store.unhealthy).toBe(false)
  })

  it('polls on a timer once started, and stops when told to', async () => {
    vi.useFakeTimers()
    try {
      store.start()
      expect(api.getHealth).toHaveBeenCalledTimes(1)

      // Async, so each check settles before the next tick: one request at a time.
      await vi.advanceTimersByTimeAsync(HEALTH_POLL_MS * 2)
      expect(api.getHealth).toHaveBeenCalledTimes(3)

      store.stop()
      await vi.advanceTimersByTimeAsync(HEALTH_POLL_MS * 2)
      expect(api.getHealth).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('asks again every five seconds the moment the server stops answering', async () => {
    vi.useFakeTimers()
    try {
      store.start()
      await vi.advanceTimersByTimeAsync(0)
      expect(api.getHealth).toHaveBeenCalledTimes(1)
      expect(store.unhealthy).toBe(false)

      // The next ordinary poll finds it down, which starts the quick retries.
      vi.mocked(api.getHealth).mockRejectedValue(new ApiNetworkError('no route to host'))
      await vi.advanceTimersByTimeAsync(HEALTH_POLL_MS)
      expect(api.getHealth).toHaveBeenCalledTimes(2)
      expect(store.unhealthy).toBe(true)
      expect(store.retrying).toBe(true)
      expect(store.retryAttempt).toBe(1)

      for (let attempt = 2; attempt <= HEALTH_RETRY_ATTEMPTS; attempt++) {
        await vi.advanceTimersByTimeAsync(HEALTH_RETRY_MS)
        expect(store.retryAttempt).toBe(attempt)
        expect(store.retrying).toBe(true)
      }

      // Five retries spent in twenty-five seconds, on top of the check that found it down.
      expect(api.getHealth).toHaveBeenCalledTimes(2 + HEALTH_RETRY_ATTEMPTS - 1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('recovers within five seconds of the server coming back', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(api.getHealth).mockRejectedValue(new ApiNetworkError('mid-deploy'))
      store.start()
      await vi.advanceTimersByTimeAsync(0)
      expect(store.unhealthy).toBe(true)

      vi.mocked(api.getHealth).mockResolvedValue(healthy)
      await vi.advanceTimersByTimeAsync(HEALTH_RETRY_MS)

      expect(store.unhealthy).toBe(false)
      expect(store.retrying).toBe(false)
      expect(store.failures).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('backs off to minutely and then doubles once the quick retries are spent', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(api.getHealth).mockRejectedValue(new ApiNetworkError('really down'))
      store.start()
      await vi.advanceTimersByTimeAsync(0)

      // Burn the five quick retries.
      await vi.advanceTimersByTimeAsync(HEALTH_RETRY_MS * HEALTH_RETRY_ATTEMPTS)
      const spent = vi.mocked(api.getHealth).mock.calls.length
      expect(spent).toBe(1 + HEALTH_RETRY_ATTEMPTS)
      expect(store.retrying).toBe(false)

      // Nothing more for nearly a minute, then one check.
      await vi.advanceTimersByTimeAsync(HEALTH_RETRY_MS)
      expect(api.getHealth).toHaveBeenCalledTimes(spent)
      await vi.advanceTimersByTimeAsync(HEALTH_POLL_MS)
      expect(api.getHealth).toHaveBeenCalledTimes(spent + 1)

      // Then two minutes, not one.
      await vi.advanceTimersByTimeAsync(HEALTH_POLL_MS)
      expect(api.getHealth).toHaveBeenCalledTimes(spent + 1)
      await vi.advanceTimersByTimeAsync(HEALTH_POLL_MS)
      expect(api.getHealth).toHaveBeenCalledTimes(spent + 2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('never waits longer than the backoff cap', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(api.getHealth).mockRejectedValue(new ApiNetworkError('down for hours'))
      store.start()
      await vi.advanceTimersByTimeAsync(0)

      // Well past the point the doubling would have run away with itself.
      await vi.advanceTimersByTimeAsync(HEALTH_BACKOFF_MAX_MS * 12)
      const spent = vi.mocked(api.getHealth).mock.calls.length

      await vi.advanceTimersByTimeAsync(HEALTH_BACKOFF_MAX_MS)

      expect(api.getHealth).toHaveBeenCalledTimes(spent + 1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not retry quickly when it is the browser that has no network', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    vi.mocked(api.getHealth).mockRejectedValue(new ApiNetworkError('offline'))

    await store.check()

    expect(store.unhealthy).toBe(false)
    expect(store.retrying).toBe(false)
    expect(store.failures).toBe(0)
  })

  it('asks straight away when the socket starts reconnecting', async () => {
    roomSync.connection = 'reconnecting'
    await nextTick()

    expect(api.getHealth).toHaveBeenCalled()
  })
})
