import { describe, expect, it } from 'vitest'
import { absoluteTime, relativeTime } from './relative-time'

const now = new Date('2026-08-31T12:00:00.000Z')
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000).toISOString()

describe('relativeTime', () => {
  it('says "now" for anything within the last minute', () => {
    expect(relativeTime(ago(0), now)).toBe('now')
    expect(relativeTime(ago(59), now)).toBe('now')
  })

  // Compared against Intl's own output rather than against English, so the
  // expectation holds wherever the suite runs.
  const said = (value: number, unit: Intl.RelativeTimeFormatUnit) =>
    new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'narrow' }).format(-value, unit)

  it.each([
    [90, 2, 'minute'],
    [60 * 60 * 3, 3, 'hour'],
    [60 * 60 * 24 * 2, 2, 'day'],
    [60 * 60 * 24 * 10, 1, 'week'],
    [60 * 60 * 24 * 60, 2, 'month'],
    [60 * 60 * 24 * 800, 2, 'year'],
  ] as [number, number, Intl.RelativeTimeFormatUnit][])(
    'counts %i seconds back as %i of the unit that reads best',
    (seconds, value, unit) => {
      expect(relativeTime(ago(seconds), now)).toBe(said(value, unit))
    },
  )

  // A server clock a moment ahead of the browser's must not read as the future.
  it('clamps a stamp from the future to "now"', () => {
    expect(relativeTime(new Date(now.getTime() + 5000).toISOString(), now)).toBe('now')
  })

  it('shows nothing at all for a missing or unreadable stamp', () => {
    expect(relativeTime(undefined, now)).toBe('')
    expect(relativeTime('not a date', now)).toBe('')
  })
})

describe('absoluteTime', () => {
  it('renders the stamp in the reader\'s own locale', () => {
    expect(absoluteTime(now.toISOString())).toBe(now.toLocaleString())
  })

  it('shows nothing for a missing or unreadable stamp', () => {
    expect(absoluteTime(undefined)).toBe('')
    expect(absoluteTime('not a date')).toBe('')
  })
})
