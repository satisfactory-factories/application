import { EVENT_CAPS, EVENT_REASONS, eventReportSchema } from 'common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import * as api from '@/api/client'
import { useEventsStore } from '@/stores/events-store'
import { useRoomSyncStore } from '@/stores/room-sync-store'

vi.mock('@/api/client', async importOriginal => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return { ...actual, sendEventReport: vi.fn() }
})

describe('events-store', () => {
  let store: ReturnType<typeof useEventsStore>
  let roomSync: ReturnType<typeof useRoomSyncStore>

  const sent = () => vi.mocked(api.sendEventReport).mock.calls.at(-1)?.[0]

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    setActivePinia(createPinia())
    roomSync = useRoomSyncStore()
    store = useEventsStore()
    vi.mocked(api.sendEventReport).mockResolvedValue('accepted')
  })

  afterEach(() => {
    store.dispose()
    roomSync.dispose()
  })

  describe('recording', () => {
    it('accumulates counts per reason', () => {
      store.record('api_network_error')
      store.record('api_network_error', 4)
      store.record('plan_repair_export_orphaned')

      expect(store.pending()).toEqual({ api_network_error: 5, plan_repair_export_orphaned: 1 })
    })

    // The check that actually bounds the buffer: a Map keyed only by enum members cannot
    // grow past the enum, however badly a caller misbehaves.
    it('refuses a reason that is not in the enum', () => {
      store.record('not_a_reason' as never)
      store.record('' as never)

      expect(store.pending()).toEqual({})
    })

    it('saturates at the cap rather than growing without limit', () => {
      store.record('api_network_error', EVENT_CAPS.count)
      store.record('api_network_error', 500)

      expect(store.pending().api_network_error).toBe(EVENT_CAPS.count)
    })

    it('ignores a non-positive count', () => {
      store.record('api_network_error', 0)
      store.record('api_network_error', -3)

      expect(store.pending()).toEqual({})
    })

    /**
     * These hooks sit inside recovery paths, so a metric that raises would turn a repaired
     * plan into a broken one.
     */
    it('never throws, whatever it is given', () => {
      expect(() => store.record(undefined as never)).not.toThrow()
      expect(() => store.record(null as never, Number.NaN)).not.toThrow()
      expect(() => store.record({} as never)).not.toThrow()
    })
  })

  describe('flushing', () => {
    it('sends the buffer and clears it', async () => {
      store.record('api_network_error', 2)

      await store.flush()

      expect(sent()?.events).toEqual([{ reason: 'api_network_error', count: 2 }])
      expect(store.pending()).toEqual({})
    })

    // The reason the bucket sizing works: on a good day this route sees no traffic at all.
    it('sends nothing at all when there is nothing to report', async () => {
      await store.flush()

      expect(api.sendEventReport).not.toHaveBeenCalled()
    })

    it('sends a body the server would accept', async () => {
      store.record('plan_repair_safe_mode_reset')

      await store.flush()

      expect(eventReportSchema.safeParse(sent()).success).toBe(true)
    })

    it('carries no message, stack or plan name', async () => {
      store.record('calc_dependency_corrupt_alert')

      await store.flush()

      expect(Object.keys(sent() ?? {}).sort())
        .toEqual(['appVersion', 'events', 'instanceId'])
    })

    it('keeps the buffer when the send is deferred', async () => {
      vi.mocked(api.sendEventReport).mockResolvedValue('deferred')
      store.record('api_network_error', 3)

      await store.flush()

      expect(store.pending()).toEqual({ api_network_error: 3 })
    })

    // A 400 or a 413 will never succeed, so retrying it forever would be a loop.
    it('drops the buffer when the server refuses the batch outright', async () => {
      vi.mocked(api.sendEventReport).mockResolvedValue('rejected')
      store.record('api_network_error', 3)

      await store.flush()

      expect(store.pending()).toEqual({})
    })

    // Counts arriving during the request must not be lost when the response clears the batch.
    it('keeps counts recorded while the flush was in flight', async () => {
      let release!: (value: 'accepted') => void
      vi.mocked(api.sendEventReport).mockReturnValue(
        new Promise(resolve => { release = resolve }) as never,
      )
      store.record('api_network_error', 2)

      const flushing = store.flush()
      store.record('api_network_error', 5)
      release('accepted')
      await flushing

      expect(store.pending()).toEqual({ api_network_error: 5 })
    })

    it('never throws when the send blows up', async () => {
      vi.mocked(api.sendEventReport).mockRejectedValue(new TypeError('Failed to fetch'))
      store.record('api_network_error')

      await expect(store.flush()).resolves.toBeUndefined()
    })

    it('says nothing in the console when a flush fails', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(api.sendEventReport).mockRejectedValue(new TypeError('Failed to fetch'))
      store.record('api_network_error')

      await store.flush()

      expect(error).not.toHaveBeenCalled()
      expect(warn).not.toHaveBeenCalled()
      error.mockRestore()
      warn.mockRestore()
    })
  })

  describe('offline mode', () => {
    it('sends nothing while offline mode is on', async () => {
      roomSync.enterOffline()
      await nextTick()
      store.record('api_network_error')

      await store.flush()

      expect(api.sendEventReport).not.toHaveBeenCalled()
    })

    // Buffered rather than discarded: the faults still happened.
    it('keeps the buffer through offline mode and sends it after', async () => {
      roomSync.enterOffline()
      await nextTick()
      store.record('api_network_error', 2)
      await store.flush()
      expect(store.pending()).toEqual({ api_network_error: 2 })

      roomSync.exitOffline()
      await nextTick()
      await store.flush()

      expect(sent()?.events).toEqual([{ reason: 'api_network_error', count: 2 }])
    })
  })

  describe('the timer', () => {
    it('flushes on the interval and stops when told to', async () => {
      vi.useFakeTimers()
      try {
        store.start()
        store.record('api_network_error')

        await vi.advanceTimersByTimeAsync(EVENT_CAPS.flushIntervalMs)
        expect(api.sendEventReport).toHaveBeenCalledTimes(1)

        store.stop()
        store.record('api_network_error')
        await vi.advanceTimersByTimeAsync(EVENT_CAPS.flushIntervalMs * 3)
        expect(api.sendEventReport).toHaveBeenCalledTimes(1)
      } finally {
        vi.useRealTimers()
      }
    })

    it('does not stack a second timer when started twice', async () => {
      vi.useFakeTimers()
      try {
        store.start()
        store.start()
        store.record('api_network_error')

        await vi.advanceTimersByTimeAsync(EVENT_CAPS.flushIntervalMs)

        expect(api.sendEventReport).toHaveBeenCalledTimes(1)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('the enum', () => {
    it('accepts every reason the server knows about', () => {
      for (const reason of EVENT_REASONS) store.record(reason)

      expect(Object.keys(store.pending()).length).toBe(EVENT_REASONS.length)
    })
  })
})
