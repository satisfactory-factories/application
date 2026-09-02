import { describe, expect, it } from 'vitest'
import { absoluteTime, relativeTime } from './relative-time'

const now = new Date('2026-08-31T12:00:00.000Z')
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000).toISOString()

describe('relativeTime', () => {
  it('counts seconds from "1s ago", never saying "now"', () => {
    expect(relativeTime(ago(0), now)).toBe('1s ago')
    expect(relativeTime(ago(1), now)).toBe('1s ago')
    expect(relativeTime(ago(30), now)).toBe('30s ago')
    expect(relativeTime(ago(59), now)).toBe('59s ago')
  })

  it('switches to minutes at the minute and hours at the hour', () => {
    expect(relativeTime(ago(60), now)).toBe('1m ago')
    expect(relativeTime(ago(90), now)).toBe('1m ago')
    expect(relativeTime(ago(60 * 10), now)).toBe('10m ago')
    expect(relativeTime(ago(60 * 59), now)).toBe('59m ago')
    expect(relativeTime(ago(60 * 60), now)).toBe('1hr ago')
    expect(relativeTime(ago(60 * 60 * 23), now)).toBe('23hr ago')
  })

  it('shows a DD/MMM/YY date once the stamp is a day old', () => {
    expect(relativeTime(ago(60 * 60 * 24), now)).toBe('30/Aug/26')
    expect(relativeTime(ago(60 * 60 * 24 * 400), now)).toBe('27/Jul/25')
  })

  // A server clock a moment ahead of the browser's must not read as the future.
  it('clamps a stamp from the near future to "1s ago"', () => {
    expect(relativeTime(new Date(now.getTime() + 5000).toISOString(), now)).toBe('1s ago')
    expect(relativeTime(ago(-89), now)).toBe('1s ago')
  })

  /**
   * A browser whose clock is days behind puts every real stamp in its future. Clamped,
   * a plan last touched a week ago reads as edited a second ago; the date at least
   * says something true.
   */
  it('shows the date rather than "1s ago" for a stamp far in the future', () => {
    expect(relativeTime(ago(-91), now)).toBe('31/Aug/26')
    expect(relativeTime(ago(-60 * 60 * 24 * 7), now)).toBe('07/Sep/26')
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
