import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { SyncedPreferences } from 'common'
import * as api from '@/api/client'
import { ApiError, ApiNetworkError, VersionMismatchError } from '@/api/client'
import { useAuthStore } from '@/stores/auth-store'
import { useRoomSyncStore } from '@/stores/room-sync-store'
import {
  fingerprintPreferences,
  readLocalPreferences,
  writeLocalPreferences,
} from '@/sync/preferences-mirror'
import eventBus from '@/utils/eventBus'

/** One PUT per burst of toggling, not one per click. */
export const PREFERENCE_PUSH_DEBOUNCE_MS = 1000

/**
 * Components own these keys and write them straight to localStorage, so there is
 * no event to listen to. Re-reading twelve keys on a timer is cheap, and it is
 * the price of not rewriting every component that has a checkbox in it.
 */
export const PREFERENCE_POLL_MS = 2000

const HTTP_CONFLICT = 409

const describe = (error: unknown): string => {
  if (error instanceof VersionMismatchError) return 'This version of the planner is out of date.'
  if (error instanceof ApiNetworkError) return 'The server could not be reached.'
  if (error instanceof ApiError) return error.message
  return error instanceof Error ? error.message : 'Unknown error'
}

interface ConflictBody {
  prefs?: SyncedPreferences
  revision?: number
}

export const usePreferencesStore = defineStore('preferences', () => {
  const roomSync = useRoomSyncStore()

  /** null until the server has been asked once. */
  const revision = ref<number | null>(null)
  const syncing = ref(false)
  const lastError = ref<string | null>(null)

  const loggedIn = computed(() => useAuthStore().isLoggedIn)
  /** Offline mode means total backend silence, preferences included. */
  const enabled = computed(() => loggedIn.value && !roomSync.isSuppressed)

  let started = false
  let lastSent = ''
  let pushTimer: ReturnType<typeof setTimeout> | undefined
  let pollTimer: ReturnType<typeof setInterval> | undefined

  const adopt = (prefs: SyncedPreferences) => {
    writeLocalPreferences(prefs)
    lastSent = fingerprintPreferences(prefs)
  }

  /**
   * Server wins per key. Keys it has never seen stay exactly as this browser has
   * them and go up in the first push, so signing in on a new device neither
   * discards its settings nor overwrites the account's.
   */
  const begin = async (): Promise<boolean> => {
    if (started || !enabled.value) return false
    started = true
    startPolling()

    try {
      const state = await api.getPreferences()
      revision.value = state.revision
      adopt(state.prefs)

      // Written into the same keys, so what is left over is the local-only half.
      if (fingerprintPreferences(readLocalPreferences()) !== lastSent) await push()
      return true
    } catch (error) {
      lastError.value = describe(error)
      return false
    }
  }

  /** Signing out leaves every preference in place; it just stops following the account. */
  const signOut = () => {
    started = false
    revision.value = null
    lastSent = ''
    clearTimeout(pushTimer)
    stopPolling()
  }

  // ===== Change detection =====

  const capture = () => {
    if (!started) return
    if (fingerprintPreferences(readLocalPreferences()) === lastSent) return
    schedulePush()
  }

  const schedulePush = () => {
    clearTimeout(pushTimer)
    pushTimer = setTimeout(() => void push(), PREFERENCE_PUSH_DEBOUNCE_MS)
  }

  const startPolling = () => {
    if (pollTimer !== undefined) return
    pollTimer = setInterval(capture, PREFERENCE_POLL_MS)
  }

  const stopPolling = () => {
    clearInterval(pollTimer)
    pollTimer = undefined
  }

  // ===== Push =====

  const push = async (retry = false): Promise<boolean> => {
    clearTimeout(pushTimer)
    if (!enabled.value) return false

    const prefs = readLocalPreferences()
    syncing.value = true

    try {
      const state = await api.savePreferences(prefs, revision.value ?? 0)
      revision.value = state.revision
      lastSent = fingerprintPreferences(prefs)
      lastError.value = null
      return true
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== HTTP_CONFLICT) {
        lastError.value = describe(error)
        return false
      }

      // Another device wrote first. Take its state, then send whatever of ours it
      // still does not have — once, off the revision it just gave us.
      const body = error.body as ConflictBody | null
      if (body?.prefs) adopt(body.prefs)
      if (typeof body?.revision === 'number') revision.value = body.revision

      const outstanding = fingerprintPreferences(readLocalPreferences()) !== lastSent
      return retry || !outstanding ? false : push(true)
    } finally {
      syncing.value = false
    }
  }

  /** Immediate, for leaving offline mode and for tests. */
  const flush = (): Promise<boolean> => push()

  // ===== Wiring =====

  const onLoggedIn = () => {
    void begin()
  }

  eventBus.on('loggedIn', onLoggedIn)
  eventBus.on('sessionExpired', signOut)

  // Queued writes flush on leaving offline mode; nothing is lost while silent.
  const stopEnabled = watch(enabled, value => {
    if (!value) return
    if (started) capture()
    else void begin()
  })

  // Offline mode pauses; signing out ends the session, so the next login merges
  // against the account again rather than picking up where this one left off.
  const stopSession = watch(loggedIn, value => {
    if (!value) signOut()
  })

  const dispose = () => {
    eventBus.off('loggedIn', onLoggedIn)
    eventBus.off('sessionExpired', signOut)
    stopEnabled()
    stopSession()
    clearTimeout(pushTimer)
    stopPolling()
    started = false
  }

  return {
    // State
    revision,
    syncing,
    lastError,
    enabled,

    // Lifecycle
    begin,
    signOut,
    dispose,

    // Change detection and sending
    capture,
    flush,
  }
})
