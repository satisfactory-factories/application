/**
 * The one service notice the planner puts up as a dialog, for news about SF's own servers that
 * everyone with a synced plan needs to hear once: an outage that will last days rather than
 * minutes, and later the all clear.
 *
 * To switch it off, set this to `null`. To announce the all clear, swap the outage for a
 * `resolved` notice with a new id, so it shows again to everyone who dismissed the outage one.
 * Each id is remembered per browser once answered, so reusing one would show nothing.
 *
 *   export const SERVICE_NOTICE: ServiceNotice | null = { id: 'isp-packet-loss-2026-11-resolved', kind: 'resolved' }
 */
export type ServiceNoticeKind = 'outage' | 'resolved'

export interface ServiceNotice {
  /** Names the dismissal key, so every new notice needs its own. */
  id: string
  kind: ServiceNoticeKind
}

// The ISP packet loss of November 2026 is fixed: this asks anyone still in offline mode to come
// back. The outage notice before it was `{ id: 'isp-packet-loss-2026-11', kind: 'outage' }`.
export const SERVICE_NOTICE: ServiceNotice | null = {
  id: 'isp-packet-loss-2026-11-resolved',
  kind: 'resolved',
}

export const serviceNoticeDismissedKey = (id: string): string => `dismissed-service-notice-${id}`

export const serviceNoticeAnswered = (notice: ServiceNotice): boolean => {
  try {
    return localStorage.getItem(serviceNoticeDismissedKey(notice.id)) === 'true'
  } catch {
    return false
  }
}

/**
 * A resolved notice is only for readers still in offline mode, and it is the way back online for
 * them. While one is waiting to be answered, the smaller "you're still in offline mode" prompt
 * stands down, so nobody is asked the same question twice on one page load.
 */
export const resolvedNoticeAwaits = (offline: boolean, notice: ServiceNotice | null = SERVICE_NOTICE): boolean =>
  offline && notice?.kind === 'resolved' && !serviceNoticeAnswered(notice)
