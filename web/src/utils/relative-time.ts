const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const HOUR = 60 * 60
const DAY = HOUR * 24

/** 01/Sep/26 — compact and unambiguous once a stamp is older than a day. */
const shortDate = (at: Date): string => {
  const day = String(at.getDate()).padStart(2, '0')
  const year = String(at.getFullYear()).slice(-2)
  return `${day}/${MONTHS[at.getMonth()]}/${year}`
}

/**
 * "1s ago" counting up through "59s ago", "1m ago", "59m ago", "1hr ago",
 * "23hr ago", then the date. Never "now": a stamp always reads as at least one
 * second old, so the text visibly counts. Empty string for anything unreadable,
 * so a missing or malformed stamp shows nothing rather than "Invalid Date".
 */
export const relativeTime = (iso: string | undefined, now: Date = new Date()): string => {
  const then = iso === undefined ? Number.NaN : new Date(iso).getTime()
  if (Number.isNaN(then)) return ''

  // Clamped to 1: a server clock a second ahead of the browser's must not say a
  // plan you just edited changes in the future.
  const elapsed = Math.max(1, Math.round((now.getTime() - then) / 1000))
  if (elapsed < 60) return `${elapsed}s ago`
  if (elapsed < HOUR) return `${Math.floor(elapsed / 60)}m ago`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}hr ago`
  return shortDate(new Date(then))
}

/** The exact time behind the compact one, for a tooltip or a title. */
export const absoluteTime = (iso: string | undefined): string => {
  const at = iso === undefined ? Number.NaN : new Date(iso).getTime()
  return Number.isNaN(at) ? '' : new Date(at).toLocaleString()
}
