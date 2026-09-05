import type { ExecutionContext } from '@nestjs/common'
import type { ThrottlerModuleOptions } from '@nestjs/throttler'
import type { Request } from 'express'

export const HEALTH_PATH = '/health'
export const VERSION_PATH = '/version'
export const SHARE_PATH = '/share'
export const METRICS_PATH = '/metrics'
export const TELEMETRY_PATH = '/telemetry'
export const EVENTS_PATH = '/events'
/** `POST /rooms/:roomId/auth`, the only endpoint that takes an invite password. */
export const ROOM_AUTH_PATTERN = /^\/rooms\/[^/]+\/auth\/?$/
export const LOGIN_PATH = '/login'
/** `GET /rooms/by-slug/:slug`, the unauthenticated invite-link probe. */
export const SLUG_LOOKUP_PATTERN = /^\/rooms\/by-slug\/[^/]+\/?$/

export const GLOBAL_THROTTLE = { name: 'global', ttl: 5 * 60 * 1000, limit: 200 } as const
export const HEALTH_THROTTLE = { name: 'health', ttl: 60 * 1000, limit: 10 } as const
/**
 * The planner polls /version once a minute per visible tab, and several tabs can share one
 * address. Generous enough for that, small enough to be worth nothing to anyone scraping it.
 */
export const VERSION_THROTTLE = { name: 'version', ttl: 60 * 1000, limit: 30 } as const
export const SHARE_THROTTLE = { name: 'share', ttl: 5 * 60 * 1000, limit: 5 } as const
export const ROOM_AUTH_THROTTLE = { name: 'roomAuth', ttl: 5 * 60 * 1000, limit: 10 } as const
/**
 * Prometheus scrapes every 15-60s, and more than one scraper is normal. Sized for a 2s
 * interval so no sane configuration is ever throttled into a gap in the graphs; the token
 * is what keeps this endpoint private, not the rate limit.
 */
export const METRICS_THROTTLE = { name: 'metrics', ttl: 60 * 1000, limit: 30 } as const
/**
 * A browser heartbeats every 5 minutes, so this is around 300 clients behind one address —
 * enough for a university or an office. Its own bucket rather than the global one in both
 * directions: a heartbeat must never spend the allowance a plan sync needs, and a busy NAT
 * heartbeating must never rate-limit the planner behind it.
 */
export const TELEMETRY_THROTTLE = { name: 'telemetry', ttl: 60 * 1000, limit: 60 } as const
/**
 * Twice the telemetry bucket, because events flush every minute rather than every five, and
 * because a shared office address should not start 429ing the moment a handful of browsers hit
 * the same bug. It is affordable only because a browser with nothing to report sends nothing
 * at all: on a good day this route sees no traffic.
 */
export const EVENTS_THROTTLE = { name: 'events', ttl: 60 * 1000, limit: 120 } as const
/**
 * Account credentials, held to the same shape as the invite-password exchange: ten
 * attempts per address per five minutes is more than a person who mistyped needs, and
 * far less than a guess through a password list needs.
 */
export const LOGIN_THROTTLE = { name: 'login', ttl: 5 * 60 * 1000, limit: 10 } as const
/**
 * The invite-link probe. One request per slug the planner checks while the owner types a
 * custom link, behind a 400ms debounce, so twenty a minute covers editing one; below that
 * it stops being a way to walk the slug space for live rooms.
 */
export const SLUG_LOOKUP_THROTTLE = { name: 'slugLookup', ttl: 60 * 1000, limit: 20 } as const

const httpRequest = (context: ExecutionContext): Request | null =>
  context.getType() === 'http' ? context.switchToHttp().getRequest<Request>() : null

const isHealthRequest = (context: ExecutionContext): boolean =>
  httpRequest(context)?.path === HEALTH_PATH

const isVersionRequest = (context: ExecutionContext): boolean =>
  httpRequest(context)?.path === VERSION_PATH

const isMetricsRequest = (context: ExecutionContext): boolean =>
  httpRequest(context)?.path === METRICS_PATH

const isTelemetryRequest = (context: ExecutionContext): boolean =>
  httpRequest(context)?.path === TELEMETRY_PATH

const isEventsRequest = (context: ExecutionContext): boolean =>
  httpRequest(context)?.path === EVENTS_PATH

const isShareCreation = (context: ExecutionContext): boolean => {
  const request = httpRequest(context)
  return request?.method === 'POST' && request.path === SHARE_PATH
}

const isRoomAuth = (context: ExecutionContext): boolean => {
  const request = httpRequest(context)
  return request?.method === 'POST' && ROOM_AUTH_PATTERN.test(request.path)
}

const isLogin = (context: ExecutionContext): boolean => {
  const request = httpRequest(context)
  return request?.method === 'POST' && request.path === LOGIN_PATH
}

const isSlugLookup = (context: ExecutionContext): boolean => {
  const request = httpRequest(context)
  return request?.method === 'GET' && SLUG_LOOKUP_PATTERN.test(request.path)
}

/**
 * Ten buckets, in two groups. Five of them — /health, /version, /metrics, /telemetry and
 * /events — are exempt from the global bucket and carry their own, so ordinary traffic can never
 * rate-limit the uptime monitor into a false outage, stop a browser hearing about a
 * release, or open a gap in the metrics; and equally, none of those four can spend the
 * allowance that plan syncing shares. The last four stack on top of the global bucket
 * rather than replacing it — share creation keeps its old 5-per-5-minutes, while the
 * invite-password exchange, the login form and the unauthenticated invite-link probe each
 * get a bucket tight enough to make guessing pointless.
 * `generateKey` drops the per-handler suffix Nest adds by default, which would otherwise
 * give every route its own allowance instead of one shared allowance per client.
 */
export const THROTTLER_OPTIONS: ThrottlerModuleOptions = {
  throttlers: [
    {
      ...GLOBAL_THROTTLE,
      skipIf: context =>
        isHealthRequest(context) ||
        isVersionRequest(context) ||
        isMetricsRequest(context) ||
        isTelemetryRequest(context) ||
        isEventsRequest(context),
    },
    { ...HEALTH_THROTTLE, skipIf: context => !isHealthRequest(context) },
    { ...VERSION_THROTTLE, skipIf: context => !isVersionRequest(context) },
    { ...METRICS_THROTTLE, skipIf: context => !isMetricsRequest(context) },
    { ...TELEMETRY_THROTTLE, skipIf: context => !isTelemetryRequest(context) },
    { ...EVENTS_THROTTLE, skipIf: context => !isEventsRequest(context) },
    { ...SHARE_THROTTLE, skipIf: context => !isShareCreation(context) },
    { ...ROOM_AUTH_THROTTLE, skipIf: context => !isRoomAuth(context) },
    { ...LOGIN_THROTTLE, skipIf: context => !isLogin(context) },
    { ...SLUG_LOOKUP_THROTTLE, skipIf: context => !isSlugLookup(context) },
  ],
  generateKey: (_context, tracker, throttlerName) => `${throttlerName}-${tracker}`,
}
