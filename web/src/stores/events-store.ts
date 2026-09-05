import { EVENT_CAPS, isEventReason } from 'common'
import { defineStore } from 'pinia'
import type { EventReason, EventReport } from 'common'
import { config } from '@/config/config'
import { readInstanceId } from '@/stores/telemetry-store'
import { sendEventReport } from '@/api/client'
import { useRoomSyncStore } from '@/stores/room-sync-store'

/** What the server counts a build under when it has no version to report. */
export const UNKNOWN_VERSION = 'unknown'

/**
 * Counts faults and flushes them to `POST /events`.
 *
 * **A batch, never one request per fault.** One request per occurrence is a request storm at
 * exactly the moment something is already looping, which is how a telemetry endpoint becomes
 * the outage. It also means an ordinary browser sends nothing at all: with an empty buffer the
 * flush is skipped entirely, so on a good day this route sees no traffic.
 *
 * **Nothing here says what went wrong beyond the reason.** No message, no stack, no plan or
 * factory name. That is what makes it safe to send anonymously, and why it does not replace
 * real error tracking.
 *
 * **Nothing here may throw.** These hooks sit inside recovery paths, which is the worst place
 * in the app for a metric to raise, so both recording and flushing are wrapped end to end.
 */
export const useEventsStore = defineStore('events', () => {
  const roomSync = useRoomSyncStore()

  const buffer = new Map<EventReason, number>()
  let timer: ReturnType<typeof setInterval> | undefined

  /**
   * Rejecting an unknown reason here is what actually bounds the buffer: the enum has a few
   * dozen members, so a `Map` keyed only by valid reasons cannot grow past that however badly
   * a caller misbehaves.
   */
  const record = (reason: EventReason, count = 1): void => {
    try {
      if (!isEventReason(reason) || count < 1) return
      const next = (buffer.get(reason) ?? 0) + count
      // Saturate rather than accumulate: past the cap the exact number stopped mattering, and
      // a retained batch must not grow without limit while the endpoint is refusing it.
      buffer.set(reason, Math.min(next, EVENT_CAPS.count))
    } catch {
      // A counter that cannot count must not break the repair it was counting.
    }
  }

  const payload = (): EventReport => ({
    instanceId: readInstanceId(),
    appVersion: config.appVersion || UNKNOWN_VERSION,
    ...(config.gitSha ? { gitSha: config.gitSha } : {}),
    events: [...buffer].map(([reason, count]) => ({ reason, count })),
  })

  /**
   * `keepalive` rather than `sendBeacon`, on both paths. `sendBeacon` reports only whether the
   * browser queued the request and never a status, so it cannot support the disposal rules
   * below; `keepalive` survives an unloading page just as well and does return a response.
   *
   * On unload the buffer is cleared without waiting: the page is going away, so retaining it
   * would retain nothing, and blocking teardown on a response is worse than losing a count.
   */
  const flush = async (options: { unloading?: boolean } = {}): Promise<void> => {
    try {
      if (roomSync.isSuppressed || buffer.size === 0) return

      const sent = payload()
      if (options.unloading) {
        void sendEventReport(sent).catch(() => undefined)
        buffer.clear()
        return
      }

      const outcome = await sendEventReport(sent)

      // 400 and 413 will never succeed, so retrying forever would be a loop. Anything else,
      // including a 429 and a transport failure, is worth keeping for the next tick.
      if (outcome === 'accepted' || outcome === 'rejected') {
        for (const { reason, count } of sent.events) {
          const remaining = (buffer.get(reason) ?? 0) - count
          if (remaining > 0) buffer.set(reason, remaining)
          else buffer.delete(reason)
        }
      }
    } catch {
      // As above. A flush that fails is not the reader's problem and says nothing in console.
    }
  }

  const onHidden = (): void => {
    if (document.visibilityState === 'hidden') void flush({ unloading: true })
  }

  const start = (): void => {
    if (timer !== undefined) return
    timer = setInterval(() => void flush(), EVENT_CAPS.flushIntervalMs)
    ;(timer as { unref?: () => void }).unref?.()
    document.addEventListener('visibilitychange', onHidden)
  }

  const stop = (): void => {
    clearInterval(timer)
    timer = undefined
    document.removeEventListener('visibilitychange', onHidden)
  }

  /** The buffered counts, for the specs and for nothing else. */
  const pending = (): Record<string, number> => Object.fromEntries(buffer)

  return { record, flush, start, stop, pending, dispose: stop }
})
