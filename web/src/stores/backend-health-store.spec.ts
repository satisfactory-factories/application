import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import * as api from '@/api/client'
import { ApiError, ApiNetworkError } from '@/api/client'
import { HEALTH_POLL_MS, useBackendHealthStore } from '@/stores/backend-health-store'
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

  it('asks straight away when the socket starts reconnecting', async () => {
    roomSync.connection = 'reconnecting'
    await nextTick()

    expect(api.getHealth).toHaveBeenCalled()
  })
})
