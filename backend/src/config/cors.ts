import { APP_VERSION_HEADER } from 'common'
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface'

/**
 * The origins the browser app is actually served from. The old list allowed the
 * API's own origin, which no browser ever sends, so every cross-origin call was
 * riding on the fact that nothing preflighted yet.
 */
export const WEB_ORIGINS = [
  'https://satisfactory-factories.app',
  'https://www.satisfactory-factories.app',
  'http://localhost:3000',
]

/**
 * Production leaves CORS_EXTRA_ORIGINS unset and keeps exactly the static list.
 * The preview API sets it, because Vercel gives every preview deployment a fresh
 * hostname and there is no list to enumerate in advance. Comma-separated; an
 * entry starting with `*.` matches any subdomain of the rest of it.
 */
export const parseExtraOrigins = (raw: string | undefined): string[] =>
  (raw ?? '').split(',').map(entry => entry.trim()).filter(Boolean)

export const isAllowedOrigin = (origin: string, extra: string[]): boolean => {
  if (WEB_ORIGINS.includes(origin)) return true

  return extra.some(entry => {
    if (!entry.startsWith('*.')) return entry === origin

    // Match on the parsed hostname rather than the raw string. Substring matching
    // would accept 'https://evil.com/#.vercel.app', and a wildcard is exactly
    // where that gets tried.
    try {
      return new URL(origin).hostname.endsWith(entry.slice(1))
    } catch {
      return false
    }
  })
}

/** Read per call so a test can set the variable without rebuilding the app. */
const extraOrigins = (): string[] => parseExtraOrigins(process.env.CORS_EXTRA_ORIGINS)

export const isAllowedHttpOrigin = (origin: string | undefined): boolean =>
  // No Origin header is not a browser cross-origin call: allowed through, with
  // nothing reflected back.
  origin === undefined || isAllowedOrigin(origin, extraOrigins())

/**
 * Anti-CSRF hygiene, not authorization: a missing Origin is a non-browser client,
 * which cannot be CSRF'd and could forge the header anyway.
 */
export const isAllowedWsOrigin = (origin: string | undefined): boolean =>
  origin === undefined || origin === '' || isAllowedOrigin(origin, extraOrigins())

export const CORS_OPTIONS: CorsOptions = {
  origin: (origin, callback) => callback(null, isAllowedHttpOrigin(origin)),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  // X-App-Version is a custom header, so every gated call now preflights.
  allowedHeaders: ['Content-Type', 'Authorization', APP_VERSION_HEADER],
}
