import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { getHealth } from '@/api/client'
import { useRoomSyncStore } from '@/stores/room-sync-store'

/** Modest on purpose while the server is answering: this is a liveness question, not a metric. */
export const HEALTH_POLL_MS = 60_000

/**
 * How fast to ask again the moment the server stops answering, and how many times. A deploy takes
 * the API away for seconds rather than minutes, so the common outage is over long before the
 * unhurried poll above would next look. Ten at five seconds covers the better part of a minute,
 * which is a whole rollout including a slow image pull, without turning a genuine outage into a
 * request every five seconds for as long as the tab stays open.
 */
export const HEALTH_RETRY_MS = 5_000
export const HEALTH_RETRY_ATTEMPTS = 10

/**
 * Once the quick retries are spent the server is properly down, so the wait doubles from the
 * ordinary poll interval up to this. Capped rather than unbounded: a tab left open overnight
 * should still notice the server coming back within a few minutes.
 */
export const HEALTH_BACKOFF_MAX_MS = 300_000

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

  /** Consecutive checks that blamed the server. Zero the moment one succeeds. */
  const failures = ref(0)

  /**
   * Still in the quick-retry window, so the server may simply be mid-deploy. The banner says
   * "reconnecting" here and holds back the ask to go and report an outage, which would be a
   * false alarm for the fifty seconds a rollout actually takes.
   */
  const retrying = computed(
    () => failures.value > 0 && failures.value <= HEALTH_RETRY_ATTEMPTS,
  )

  /** 1-based, for the banner. Clamped so it never reads past the last attempt. */
  const retryAttempt = computed(() => Math.min(failures.value, HEALTH_RETRY_ATTEMPTS))

  let timer: ReturnType<typeof setTimeout> | undefined
  let running = false

  const browserIsOffline = (): boolean =>
    typeof navigator !== 'undefined' && navigator.onLine === false

  /**
   * Healthy: the ordinary poll. The first ten failures: five seconds apart. After that: a minute,
   * then doubling to the cap.
   */
  const nextDelay = (): number => {
    if (failures.value === 0) return HEALTH_POLL_MS
    if (failures.value <= HEALTH_RETRY_ATTEMPTS) return HEALTH_RETRY_MS

    const doublings = failures.value - HEALTH_RETRY_ATTEMPTS - 1
    return Math.min(HEALTH_POLL_MS * 2 ** doublings, HEALTH_BACKOFF_MAX_MS)
  }

  const schedule = () => {
    if (!running) return
    clearTimeout(timer)
    timer = setTimeout(() => void check(), nextDelay())
  }

  const record = (serverIsUp: boolean) => {
    unhealthy.value = !serverIsUp
    failures.value = serverIsUp ? 0 : failures.value + 1
  }

  /** Nothing was learned, so the cadence goes back to the unhurried one rather than retrying. */
  const recordNoEvidence = () => {
    unhealthy.value = false
    failures.value = 0
  }

  const check = async (): Promise<void> => {
    if (roomSync.isSuppressed) {
      recordNoEvidence()
      schedule()
      return
    }
    // A check already in flight will reschedule when it settles, so this one simply stands down.
    if (checking.value) return

    checking.value = true
    try {
      const health = await getHealth()
      record(health?.status === 'ok')
    } catch {
      // A 503 arrives as a thrown ApiError, an unreachable server as a network one,
      // and both mean the same thing to a reader.
      if (browserIsOffline()) recordNoEvidence()
      else record(false)
    } finally {
      checking.value = false
      schedule()
    }
  }

  const start = () => {
    if (running) return
    running = true
    void check()
  }

  const stop = () => {
    running = false
    clearTimeout(timer)
    timer = undefined
  }

  // A socket that has started reconnecting is the earliest hint anything is wrong,
  // and waiting out the rest of the poll interval to confirm it helps nobody.
  const stopWatch = watch(() => roomSync.connection, status => {
    if (status === 'reconnecting') void check()
  })

  // Offline mode is silence in both directions: nothing is asked, and nothing is claimed.
  const stopOfflineWatch = watch(() => roomSync.isSuppressed, suppressed => {
    if (suppressed) recordNoEvidence()
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
    failures,
    retrying,
    retryAttempt,
    check,
    start,
    stop,
    dispose,
  }
})
