import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { getHealth } from '@/api/client'
import { useRoomSyncStore } from '@/stores/room-sync-store'

/** Modest on purpose: this is a liveness question, not a metric. */
export const HEALTH_POLL_MS = 60_000

/**
 * Is the API answering `/health` honestly? A 503, a `fail` body or a request that
 * never lands says it is not, and the banner goes up.
 *
 * Two things are deliberately not it. Offline mode means total backend silence, so
 * the poll does not run at all and whatever it last knew is forgotten. And a browser
 * that says it has no network at all is not evidence about the server, which matters
 * because the banner asks the reader to go and report an outage.
 */
export const useBackendHealthStore = defineStore('backendHealth', () => {
  const roomSync = useRoomSyncStore()

  const unhealthy = ref(false)
  const checking = ref(false)

  let timer: ReturnType<typeof setInterval> | undefined

  const browserIsOffline = (): boolean =>
    typeof navigator !== 'undefined' && navigator.onLine === false

  const check = async (): Promise<void> => {
    if (roomSync.isSuppressed) {
      unhealthy.value = false
      return
    }
    if (checking.value) return

    checking.value = true
    try {
      const health = await getHealth()
      unhealthy.value = health?.status !== 'ok'
    } catch {
      // A 503 arrives as a thrown ApiError, an unreachable server as a network one,
      // and both mean the same thing to a reader.
      unhealthy.value = !browserIsOffline()
    } finally {
      checking.value = false
    }
  }

  const start = () => {
    if (timer !== undefined) return
    void check()
    timer = setInterval(() => void check(), HEALTH_POLL_MS)
  }

  const stop = () => {
    clearInterval(timer)
    timer = undefined
  }

  // A socket that has started reconnecting is the earliest hint anything is wrong,
  // and waiting out the rest of the poll interval to confirm it helps nobody.
  const stopWatch = watch(() => roomSync.connection, status => {
    if (status === 'reconnecting') void check()
  })

  // Offline mode is silence in both directions: nothing is asked, and nothing is claimed.
  const stopOfflineWatch = watch(() => roomSync.isSuppressed, suppressed => {
    if (suppressed) unhealthy.value = false
    else void check()
  })

  const dispose = () => {
    stop()
    stopWatch()
    stopOfflineWatch()
  }

  return {
    unhealthy,
    checking,
    check,
    start,
    stop,
    dispose,
  }
})
