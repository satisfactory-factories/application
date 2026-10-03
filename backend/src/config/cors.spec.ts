import { afterEach, describe, expect, it } from 'vitest'

import { WEB_ORIGINS, isAllowedHttpOrigin, isAllowedOrigin, isAllowedWsOrigin, parseExtraOrigins } from './cors'

describe('parseExtraOrigins', () => {
  it('returns nothing when the variable is unset, which is production', () => {
    expect(parseExtraOrigins(undefined)).toEqual([])
    expect(parseExtraOrigins('')).toEqual([])
  })

  it('splits on commas and tolerates the spacing a human would type', () => {
    expect(parseExtraOrigins(' *.vercel.app , https://example.com ,, ')).toEqual([
      '*.vercel.app',
      'https://example.com',
    ])
  })
})

describe('isAllowedOrigin', () => {
  it('allows the static origins with no configuration at all', () => {
    for (const origin of WEB_ORIGINS) {
      expect(isAllowedOrigin(origin, [])).toBe(true)
    }
  })

  it('refuses anything else when nothing extra is configured', () => {
    expect(isAllowedOrigin('https://api.satisfactory-factories.app', [])).toBe(false)
    expect(isAllowedOrigin('https://sf-abc123.vercel.app', [])).toBe(false)
  })

  it('allows an exact extra origin', () => {
    expect(isAllowedOrigin('https://example.com', ['https://example.com'])).toBe(true)
    expect(isAllowedOrigin('https://example.com.evil.net', ['https://example.com'])).toBe(false)
  })

  it('allows any subdomain of a wildcard entry', () => {
    const extra = ['*.vercel.app']
    expect(isAllowedOrigin('https://sf-abc123.vercel.app', extra)).toBe(true)
    expect(isAllowedOrigin('https://a.b.vercel.app', extra)).toBe(true)
  })

  it('does not let a wildcard match the bare domain or a lookalike', () => {
    const extra = ['*.vercel.app']
    expect(isAllowedOrigin('https://vercel.app', extra)).toBe(false)
    expect(isAllowedOrigin('https://notvercel.app', extra)).toBe(false)
    expect(isAllowedOrigin('https://vercel.app.evil.net', extra)).toBe(false)
  })

  it('matches the hostname, not the raw string', () => {
    const extra = ['*.vercel.app']
    // The whole reason the check parses the URL: both of these end in '.vercel.app'.
    expect(isAllowedOrigin('https://evil.com/#.vercel.app', extra)).toBe(false)
    expect(isAllowedOrigin('https://evil.com/?x=.vercel.app', extra)).toBe(false)
  })

  it('refuses an unparseable origin rather than throwing', () => {
    expect(isAllowedOrigin('not-a-url', ['*.vercel.app'])).toBe(false)
  })
})

describe('the environment-driven wrappers', () => {
  afterEach(() => {
    delete process.env.CORS_EXTRA_ORIGINS
  })

  it('a preview origin is refused until CORS_EXTRA_ORIGINS names it', () => {
    expect(isAllowedHttpOrigin('https://sf-abc123.vercel.app')).toBe(false)
    expect(isAllowedWsOrigin('https://sf-abc123.vercel.app')).toBe(false)

    process.env.CORS_EXTRA_ORIGINS = '*.vercel.app'

    expect(isAllowedHttpOrigin('https://sf-abc123.vercel.app')).toBe(true)
    expect(isAllowedWsOrigin('https://sf-abc123.vercel.app')).toBe(true)
    // The hostname-parse guard holds on the WS path too, where it matters most.
    expect(isAllowedWsOrigin('https://evil.com/#.vercel.app')).toBe(false)
  })

  it('a missing Origin stays allowed: non-browser clients cannot be CSRF\'d', () => {
    expect(isAllowedHttpOrigin(undefined)).toBe(true)
    expect(isAllowedWsOrigin(undefined)).toBe(true)
    expect(isAllowedWsOrigin('')).toBe(true)
  })
})
