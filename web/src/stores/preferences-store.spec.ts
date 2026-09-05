import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import type { SyncedPreferences } from 'common'
import * as api from '@/api/client'
import { ApiError } from '@/api/client'
import { useAuthStore } from '@/stores/auth-store'
import { PREFERENCE_POLL_MS, PREFERENCE_PUSH_DEBOUNCE_MS, usePreferencesStore } from '@/stores/preferences-store'
import { useRoomSyncStore } from '@/stores/room-sync-store'

vi.mock('@/api/client', async importOriginal => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return {
    ...actual,
    getPreferences: vi.fn(),
    savePreferences: vi.fn(),
  }
})

const conflict = (prefs: SyncedPreferences, revision: number): ApiError =>
  new ApiError(409, 'Preferences changed elsewhere', { code: 'revision_mismatch', prefs, revision })

describe('preferences-store', () => {
  let store: ReturnType<typeof usePreferencesStore>
  let roomSync: ReturnType<typeof useRoomSyncStore>

  const serverHas = (prefs: SyncedPreferences, revision = 1) => {
    vi.mocked(api.getPreferences).mockResolvedValue({ prefs, revision })
  }

  const saveReturns = (prefs: SyncedPreferences, revision: number) => {
    vi.mocked(api.savePreferences).mockResolvedValue({ prefs, revision })
  }

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.useFakeTimers()
    setActivePinia(createPinia())

    // Signed in before the store exists, so `enabled` never transitions and the
    // watcher does not begin a sync behind the test's back.
    const authStore = useAuthStore()
    authStore.token = 'token'
    authStore.loggedInUser = 'pioneer'

    roomSync = useRoomSyncStore()
    store = usePreferencesStore()

    serverHas({}, 0)
    saveReturns({}, 1)
  })

  afterEach(() => {
    store.dispose()
    roomSync.dispose()
    vi.useRealTimers()
  })

  describe('login merge', () => {
    it('lets the server win on every key it already holds', async () => {
      localStorage.setItem('summaryHidden', 'true')
      serverHas({ summaryHidden: false }, 4)

      await store.begin()

      expect(localStorage.getItem('summaryHidden')).toBe('false')
      expect(store.revision).toBe(4)
    })

    it('uploads keys the server has never seen', async () => {
      localStorage.setItem('statisticsHidden', 'true')
      serverHas({ summaryHidden: true }, 4)
      saveReturns({}, 5)

      await store.begin()

      expect(api.savePreferences).toHaveBeenCalledWith(
        { summaryHidden: true, statisticsHidden: true },
        4,
      )
      expect(store.revision).toBe(5)
    })

    it('sends nothing when the two sides already agree', async () => {
      localStorage.setItem('summaryHidden', 'true')
      serverHas({ summaryHidden: true }, 2)

      await store.begin()

      expect(api.savePreferences).not.toHaveBeenCalled()
    })

    it('does not fetch twice when the login event lands after an explicit begin', async () => {
      await store.begin()
      await store.begin()

      expect(api.getPreferences).toHaveBeenCalledTimes(1)
    })
  })

  describe('change detection', () => {
    it('sends one PUT for a burst of toggling', async () => {
      await store.begin()
      vi.mocked(api.savePreferences).mockClear()

      localStorage.setItem('summaryHidden', 'true')
      store.capture()
      localStorage.setItem('statisticsHidden', 'true')
      store.capture()

      await vi.advanceTimersByTimeAsync(PREFERENCE_PUSH_DEBOUNCE_MS)

      expect(api.savePreferences).toHaveBeenCalledTimes(1)
      expect(api.savePreferences).toHaveBeenCalledWith(
        { summaryHidden: true, statisticsHidden: true },
        expect.any(Number),
      )
    })

    it('notices a component writing a key with no event to listen to', async () => {
      await store.begin()
      vi.mocked(api.savePreferences).mockClear()

      localStorage.setItem('statisticsProductsHidden', 'true')
      await vi.advanceTimersByTimeAsync(PREFERENCE_POLL_MS + PREFERENCE_PUSH_DEBOUNCE_MS)

      expect(api.savePreferences).toHaveBeenCalledWith({ statisticsProductsHidden: true }, 0)
    })

    it('stays quiet when nothing changed', async () => {
      await store.begin()
      vi.mocked(api.savePreferences).mockClear()

      await vi.advanceTimersByTimeAsync(PREFERENCE_POLL_MS * 3)

      expect(api.savePreferences).not.toHaveBeenCalled()
    })
  })

  describe('conflicts', () => {
    it('takes the server state on a 409', async () => {
      await store.begin()
      localStorage.setItem('summaryHidden', 'true')
      vi.mocked(api.savePreferences).mockRejectedValueOnce(conflict({ summaryHidden: false }, 9))

      await store.flush()

      expect(localStorage.getItem('summaryHidden')).toBe('false')
      expect(store.revision).toBe(9)
    })

    it('re-sends what the winner did not have, off the revision it gave us', async () => {
      await store.begin()
      localStorage.setItem('statisticsHidden', 'true')
      vi.mocked(api.savePreferences)
        .mockRejectedValueOnce(conflict({ summaryHidden: true }, 9))
        .mockResolvedValueOnce({ prefs: {}, revision: 10 })

      await store.flush()

      expect(api.savePreferences).toHaveBeenLastCalledWith(
        { summaryHidden: true, statisticsHidden: true },
        9,
      )
      expect(store.revision).toBe(10)
    })

    it('gives up after one retry rather than looping', async () => {
      await store.begin()
      localStorage.setItem('statisticsHidden', 'true')
      vi.mocked(api.savePreferences).mockRejectedValue(conflict({ summaryHidden: true }, 9))

      await store.flush()

      expect(api.savePreferences).toHaveBeenCalledTimes(2)
    })
  })

  describe('gating', () => {
    it('does nothing at all while logged out', async () => {
      const authStore = useAuthStore()
      authStore.token = ''
      authStore.loggedInUser = ''

      expect(await store.begin()).toBe(false)
      expect(api.getPreferences).not.toHaveBeenCalled()
    })

    it('sends nothing while offline mode is on', async () => {
      await store.begin()
      vi.mocked(api.savePreferences).mockClear()
      roomSync.mode = 'offline'
      await nextTick()

      localStorage.setItem('summaryHidden', 'true')
      await vi.advanceTimersByTimeAsync(PREFERENCE_POLL_MS + PREFERENCE_PUSH_DEBOUNCE_MS)

      expect(api.savePreferences).not.toHaveBeenCalled()
    })

    it('flushes what piled up when offline mode ends', async () => {
      await store.begin()
      roomSync.mode = 'offline'
      await nextTick()
      localStorage.setItem('summaryHidden', 'true')
      vi.mocked(api.savePreferences).mockClear()

      roomSync.mode = 'online'
      await nextTick()
      await vi.advanceTimersByTimeAsync(PREFERENCE_PUSH_DEBOUNCE_MS)

      expect(api.savePreferences).toHaveBeenCalledWith({ summaryHidden: true }, 0)
    })
  })

  it('keeps every preference in place when the session ends', async () => {
    localStorage.setItem('summaryHidden', 'true')
    await store.begin()

    store.signOut()

    expect(localStorage.getItem('summaryHidden')).toBe('true')
    expect(store.revision).toBeNull()
  })

  it('re-merges against the account on the next login rather than resuming', async () => {
    const authStore = useAuthStore()
    await store.begin()

    authStore.token = ''
    authStore.loggedInUser = ''
    await nextTick()
    authStore.token = 'token'
    authStore.loggedInUser = 'pioneer'
    await nextTick()
    await vi.advanceTimersByTimeAsync(0)

    expect(api.getPreferences).toHaveBeenCalledTimes(2)
  })
})
