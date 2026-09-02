import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TELEMETRY_CAPS, telemetryHeartbeatSchema } from 'common'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import * as api from '@/api/client'
import { TELEMETRY_INSTANCE_KEY, UNKNOWN_VERSION, useTelemetryStore } from '@/stores/telemetry-store'
import { useAppStore } from '@/stores/app-store'
import { useAuthStore } from '@/stores/auth-store'
import { useRoomSyncStore } from '@/stores/room-sync-store'

vi.mock('@/api/client', async importOriginal => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return { ...actual, sendTelemetryHeartbeat: vi.fn() }
})

/**
 * Written out rather than read off the schema, and the whole reason this spec exists.
 * Anything added to the heartbeat has to be added here too, which is the moment somebody
 * has to look at `docs/telemetry.md` and decide whether the new field belongs in it.
 */
const ALLOWED_FIELDS = [
  'appVersion',
  'cloudTabCount',
  'factoriesTotal',
  'instanceId',
  'localTabCount',
  'signedIn',
  'tabCount',
]

/** Anything that would identify a person, however indirectly. None of it may appear. */
const FORBIDDEN_FIELDS = [
  'username', 'user', 'userId', 'accountId', 'email', 'token', 'name',
  'planName', 'planNames', 'tabNames', 'factoryNames', 'roomId', 'roomIds', 'slug',
]

describe('telemetry-store', () => {
  let store: ReturnType<typeof useTelemetryStore>
  let appStore: ReturnType<typeof useAppStore>
  let authStore: ReturnType<typeof useAuthStore>
  let roomSync: ReturnType<typeof useRoomSyncStore>

  const sent = () => vi.mocked(api.sendTelemetryHeartbeat).mock.calls.at(-1)?.[0]

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    setActivePinia(createPinia())
    appStore = useAppStore()
    authStore = useAuthStore()
    roomSync = useRoomSyncStore()
    store = useTelemetryStore()
    vi.mocked(api.sendTelemetryHeartbeat).mockResolvedValue(undefined)
  })

  afterEach(() => {
    store.dispose()
    roomSync.dispose()
  })

  describe('what it sends, and what it must never send', () => {
    it('sends exactly the allowed fields and nothing else', async () => {
      await store.send()

      expect(Object.keys(sent() ?? {}).sort()).toEqual(ALLOWED_FIELDS)
    })

    it.each(FORBIDDEN_FIELDS)('never sends a %s', async field => {
      appStore.addTab({ id: 'room-a', name: 'Steel Works', factories: [] }, { activate: false })
      authStore.setLoggedInUser('mael')

      await store.send()

      expect(sent()).not.toHaveProperty(field)
    })

    it('sends nothing the server would refuse', async () => {
      appStore.addTab({ id: 'room-a', name: 'A', factories: [] }, { activate: false })

      await store.send()

      expect(telemetryHeartbeatSchema.safeParse(sent()).success).toBe(true)
    })

    it('carries no plan or tab name anywhere in the serialised body', async () => {
      appStore.addTab({ id: 'room-a', name: 'Uranium Enrichment', factories: [] }, { activate: false })

      await store.send()

      expect(JSON.stringify(sent())).not.toContain('Uranium')
    })
  })

  describe('the counts', () => {
    it('splits tabs into local and cloud, counting joined tabs as cloud', () => {
      // A fresh store already holds one local "Default" tab, so the local count is the
      // two added below plus that one.
      const localBefore = appStore.getTabs().length
      appStore.addTab({ id: 'local-a', name: 'A', factories: [] }, { activate: false })
      appStore.addTab({ id: 'synced-a', name: 'B', factories: [] }, { activate: false })
      appStore.addTab({ id: 'joined-a', name: 'C', factories: [] }, { activate: false })
      appStore.setTabState('synced-a', { kind: 'synced' })
      appStore.setTabState('joined-a', { kind: 'joined' })

      const heartbeat = store.buildHeartbeat()

      expect(heartbeat.localTabCount).toBe(localBefore + 1)
      expect(heartbeat.cloudTabCount).toBe(2)
      expect(heartbeat.tabCount).toBe(heartbeat.localTabCount + heartbeat.cloudTabCount)
    })

    it('sums factories across every tab, local ones included', () => {
      appStore.addTab(
        { id: 'a', name: 'A', factories: [{ id: 1 }, { id: 2 }] as never },
        { activate: false },
      )
      appStore.addTab({ id: 'b', name: 'B', factories: [{ id: 3 }] as never }, { activate: false })
      appStore.setTabState('b', { kind: 'synced' })

      expect(store.buildHeartbeat().factoriesTotal).toBe(3)
    })

    it('says whether somebody is signed in, never who', () => {
      expect(store.buildHeartbeat().signedIn).toBe(false)

      authStore.setToken('a-token')
      authStore.setLoggedInUser('mael')

      const heartbeat = store.buildHeartbeat()
      expect(heartbeat.signedIn).toBe(true)
      expect(JSON.stringify(heartbeat)).not.toContain('mael')
    })

    it('falls back to a placeholder when the build has no version', () => {
      expect(store.buildHeartbeat().appVersion.length).toBeGreaterThan(0)
    })
  })

  describe('the instance id', () => {
    it('mints a UUID, stores it, and keeps using the same one', async () => {
      await store.send()
      const first = sent()?.instanceId

      expect(first).toMatch(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i)
      expect(localStorage.getItem(TELEMETRY_INSTANCE_KEY)).toBe(first)

      await store.send()
      expect(sent()?.instanceId).toBe(first)
    })

    it('reuses an id a previous session stored', async () => {
      const existing = '3f6c1b3a-9d0e-4a21-8f77-2b5c9e0a4d18'
      localStorage.setItem(TELEMETRY_INSTANCE_KEY, existing)
      setActivePinia(createPinia())

      await useTelemetryStore().send()

      expect(sent()?.instanceId).toBe(existing)
    })

    it('replaces a stored value that is not a UUID rather than sending it', async () => {
      localStorage.setItem(TELEMETRY_INSTANCE_KEY, 'mael@example.com')
      setActivePinia(createPinia())

      await useTelemetryStore().send()

      expect(sent()?.instanceId).not.toBe('mael@example.com')
      expect(telemetryHeartbeatSchema.safeParse(sent()).success).toBe(true)
    })

    // The promise in docs/telemetry.md: the id is random, so signing in cannot change it
    // and cannot be recovered from it.
    it('does not change when the user signs in or out', async () => {
      await store.send()
      const before = sent()?.instanceId

      authStore.setToken('a-token')
      authStore.setLoggedInUser('mael')
      await store.send()
      expect(sent()?.instanceId).toBe(before)

      authStore.setToken('')
      authStore.setLoggedInUser('')
      await store.send()
      expect(sent()?.instanceId).toBe(before)
    })

    it('gives two browsers different ids', async () => {
      await store.send()
      const first = sent()?.instanceId

      localStorage.clear()
      setActivePinia(createPinia())
      await useTelemetryStore().send()

      expect(sent()?.instanceId).not.toBe(first)
    })
  })

  describe('the interval', () => {
    it('sends once on start, then every five minutes, and stops when told to', async () => {
      vi.useFakeTimers()
      try {
        store.start()
        expect(api.sendTelemetryHeartbeat).toHaveBeenCalledTimes(1)

        await vi.advanceTimersByTimeAsync(TELEMETRY_CAPS.intervalMs * 2)
        expect(api.sendTelemetryHeartbeat).toHaveBeenCalledTimes(3)

        store.stop()
        await vi.advanceTimersByTimeAsync(TELEMETRY_CAPS.intervalMs * 3)
        expect(api.sendTelemetryHeartbeat).toHaveBeenCalledTimes(3)
      } finally {
        vi.useRealTimers()
      }
    })

    it('does not stack a second timer when started twice', async () => {
      vi.useFakeTimers()
      try {
        store.start()
        store.start()
        expect(api.sendTelemetryHeartbeat).toHaveBeenCalledTimes(1)

        await vi.advanceTimersByTimeAsync(TELEMETRY_CAPS.intervalMs)
        expect(api.sendTelemetryHeartbeat).toHaveBeenCalledTimes(2)
      } finally {
        vi.useRealTimers()
      }
    })

    it('can be started again after being disposed', async () => {
      vi.useFakeTimers()
      try {
        store.start()
        store.dispose()
        // One send per start, so two before the timer has ticked at all.
        store.start()
        expect(api.sendTelemetryHeartbeat).toHaveBeenCalledTimes(2)

        await vi.advanceTimersByTimeAsync(TELEMETRY_CAPS.intervalMs)
        expect(api.sendTelemetryHeartbeat).toHaveBeenCalledTimes(3)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('offline mode', () => {
    it('sends nothing at all while offline mode is on', async () => {
      roomSync.enterOffline()
      await nextTick()

      await store.send()

      expect(api.sendTelemetryHeartbeat).not.toHaveBeenCalled()
    })

    it('stays silent on every tick of the timer, not just the first', async () => {
      vi.useFakeTimers()
      try {
        roomSync.enterOffline()
        await nextTick()

        store.start()
        await vi.advanceTimersByTimeAsync(TELEMETRY_CAPS.intervalMs * 4)

        expect(api.sendTelemetryHeartbeat).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })

    it('picks up again once offline mode is left', async () => {
      roomSync.enterOffline()
      await nextTick()
      await store.send()
      expect(api.sendTelemetryHeartbeat).not.toHaveBeenCalled()

      roomSync.exitOffline()
      await nextTick()
      await store.send()

      expect(api.sendTelemetryHeartbeat).toHaveBeenCalledTimes(1)
    })
  })

  describe('failure', () => {
    it.each([
      ['a network error', new TypeError('Failed to fetch')],
      ['a rejection with no error at all', undefined],
    ])('swallows %s rather than rejecting', async (_label, reason) => {
      vi.mocked(api.sendTelemetryHeartbeat).mockRejectedValue(reason)

      await expect(store.send()).resolves.toBeUndefined()
    })

    it('says nothing in the console when a heartbeat fails', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(api.sendTelemetryHeartbeat).mockRejectedValue(new TypeError('Failed to fetch'))

      await store.send()

      expect(error).not.toHaveBeenCalled()
      expect(warn).not.toHaveBeenCalled()
      error.mockRestore()
      warn.mockRestore()
    })

    it('keeps beating after one fails', async () => {
      vi.useFakeTimers()
      try {
        vi.mocked(api.sendTelemetryHeartbeat).mockRejectedValueOnce(new TypeError('Failed to fetch'))

        store.start()
        await vi.advanceTimersByTimeAsync(TELEMETRY_CAPS.intervalMs)

        expect(api.sendTelemetryHeartbeat).toHaveBeenCalledTimes(2)
      } finally {
        vi.useRealTimers()
      }
    })
  })
})

describe('the version placeholder', () => {
  it('is not something the server will mistake for a real version', () => {
    // It must fail the server's label pattern, so it buckets as `other` rather than
    // becoming a series of its own.
    expect(UNKNOWN_VERSION).not.toMatch(/^\d+\.\d+\.\d+/)
  })
})
