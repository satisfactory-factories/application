import { EVENT_CAPS, isEventReason, isUsageAction } from 'common'
import { defineStore } from 'pinia'
import type { EventReason, EventReport, UsageAction } from 'common'
import { config } from '@/config/config'
import { readInstanceId } from '@/stores/telemetry-store'
import { sendEventReport } from '@/api/client'
import { useRoomSyncStore } from '@/stores/room-sync-store'

/** What the server counts a build under when it has no version to report. */
export const UNKNOWN_VERSION = 'unknown'

/**
 * Counts faults, and things people did, and flushes both to `POST /events`.
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
  // Usage rides on the same report in its own list, so the fault counters stay faults.
  const usage = new Map<UsageAction, number>()
  let timer: ReturnType<typeof setInterval> | undefined

  const bump = <K>(counts: Map<K, number>, key: K, count: number): void => {
    const next = (counts.get(key) ?? 0) + count
    // Saturate rather than accumulate: past the cap the exact number stopped mattering, and
    // a retained batch must not grow without limit while the endpoint is refusing it.
    counts.set(key, Math.min(next, EVENT_CAPS.count))
  }

  const settle = <K>(counts: Map<K, number>, sent: Array<{ key: K, count: number }>): void => {
    for (const { key, count } of sent) {
      const remaining = (counts.get(key) ?? 0) - count
      if (remaining > 0) counts.set(key, remaining)
      else counts.delete(key)
    }
  }

  /**
   * Rejecting an unknown reason here is what actually bounds the buffer: the enum has a few
   * dozen members, so a `Map` keyed only by valid reasons cannot grow past that however badly
   * a caller misbehaves.
   */
  const record = (reason: EventReason, count = 1): void => {
    try {
      if (!isEventReason(reason) || count < 1) return
      bump(buffer, reason, count)
    } catch {
      // A counter that cannot count must not break the repair it was counting.
    }
  }

  /** Same bound as `record`: only an action the server knows can occupy a slot. */
  const recordUsage = (action: UsageAction, count = 1): void => {
    try {
      if (!isUsageAction(action) || count < 1) return
      bump(usage, action, count)
    } catch {
      // As above; a search that cannot be counted still jumps.
    }
  }

  const payload = (): EventReport => ({
    instanceId: readInstanceId(),
    appVersion: config.appVersion || UNKNOWN_VERSION,
    ...(config.gitSha ? { gitSha: config.gitSha } : {}),
    ...(buffer.size > 0 ? { events: [...buffer].map(([reason, count]) => ({ reason, count })) } : {}),
    ...(usage.size > 0 ? { usage: [...usage].map(([action, count]) => ({ action, count })) } : {}),
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
      if (roomSync.isSuppressed || (buffer.size === 0 && usage.size === 0)) return

      const sent = payload()
      if (options.unloading) {
        void sendEventReport(sent).catch(() => undefined)
        buffer.clear()
        usage.clear()
        return
      }

      const outcome = await sendEventReport(sent)

      // 400 and 413 will never succeed, so retrying forever would be a loop. Anything else,
      // including a 429 and a transport failure, is worth keeping for the next tick.
      if (outcome === 'accepted' || outcome === 'rejected') {
        settle(buffer, (sent.events ?? []).map(({ reason, count }) => ({ key: reason, count })))
        settle(usage, (sent.usage ?? []).map(({ action, count }) => ({ key: action, count })))
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
  const pendingUsage = (): Record<string, number> => Object.fromEntries(usage)

  return { record, recordUsage, flush, start, stop, pending, pendingUsage, dispose: stop }
})
