/** Longest span each unit covers before the next one up reads better. */
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60 * 60],
  ['hour', 60 * 60 * 24],
  ['day', 60 * 60 * 24 * 7],
  ['week', 60 * 60 * 24 * 30],
  ['month', 60 * 60 * 24 * 365],
]

const SECONDS_IN: Record<string, number> = {
  second: 1,
  minute: 60,
  hour: 60 * 60,
  day: 60 * 60 * 24,
  week: 60 * 60 * 24 * 7,
  month: 60 * 60 * 24 * 30,
  year: 60 * 60 * 24 * 365,
}

const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'narrow' })

/**
 * "3 min. ago" for an ISO timestamp, in the reader's own locale. Empty string for
 * anything unreadable, so a missing or malformed stamp shows nothing rather than
 * "Invalid Date".
 */
export const relativeTime = (iso: string | undefined, now: Date = new Date()): string => {
  const then = iso === undefined ? Number.NaN : new Date(iso).getTime()
  if (Number.isNaN(then)) return ''

  // Clamped: a server clock a second ahead of the browser's would otherwise say a
  // plan you just edited changes "in 1 second".
  const elapsed = Math.max(0, Math.round((now.getTime() - then) / 1000))
  if (elapsed < 60) return formatter.format(0, 'second')

  const [unit] = STEPS.find(([, ceiling]) => elapsed < ceiling) ?? ['year' as const]
  return formatter.format(-Math.round(elapsed / SECONDS_IN[unit]), unit)
}

/** The exact time behind the compact one, for a tooltip or a title. */
export const absoluteTime = (iso: string | undefined): string => {
  const at = iso === undefined ? Number.NaN : new Date(iso).getTime()
  return Number.isNaN(at) ? '' : new Date(at).toLocaleString()
}
