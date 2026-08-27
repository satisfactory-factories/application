import type { ExecutionContext } from '@nestjs/common'
import type { ThrottlerModuleOptions } from '@nestjs/throttler'
import type { Request } from 'express'

export const HEALTH_PATH = '/health'
export const SHARE_PATH = '/share'
/** `POST /rooms/:roomId/auth`, the only endpoint that takes an invite password. */
export const ROOM_AUTH_PATTERN = /^\/rooms\/[^/]+\/auth\/?$/

export const GLOBAL_THROTTLE = { name: 'global', ttl: 5 * 60 * 1000, limit: 200 } as const
export const HEALTH_THROTTLE = { name: 'health', ttl: 60 * 1000, limit: 10 } as const
export const SHARE_THROTTLE = { name: 'share', ttl: 5 * 60 * 1000, limit: 5 } as const
export const ROOM_AUTH_THROTTLE = { name: 'roomAuth', ttl: 5 * 60 * 1000, limit: 10 } as const

const httpRequest = (context: ExecutionContext): Request | null =>
  context.getType() === 'http' ? context.switchToHttp().getRequest<Request>() : null

const isHealthRequest = (context: ExecutionContext): boolean =>
  httpRequest(context)?.path === HEALTH_PATH

const isShareCreation = (context: ExecutionContext): boolean => {
  const request = httpRequest(context)
  return request?.method === 'POST' && request.path === SHARE_PATH
}

const isRoomAuth = (context: ExecutionContext): boolean => {
  const request = httpRequest(context)
  return request?.method === 'POST' && ROOM_AUTH_PATTERN.test(request.path)
}

/**
 * Four buckets. The first two mirror the express-rate-limit setup this replaces:
 * /health is exempt from the global one so ordinary traffic can never rate-limit
 * the uptime monitor into reporting a false outage. The last two stack on top of
 * the global bucket rather than replacing it — share creation keeps its old
 * 5-per-5-minutes, and the invite-password exchange gets a bucket tight enough to
 * make guessing pointless. `generateKey` drops the per-handler suffix Nest adds by
 * default, which would otherwise give every route its own allowance instead of one
 * shared allowance per client.
 */
export const THROTTLER_OPTIONS: ThrottlerModuleOptions = {
  throttlers: [
    { ...GLOBAL_THROTTLE, skipIf: isHealthRequest },
    { ...HEALTH_THROTTLE, skipIf: context => !isHealthRequest(context) },
    { ...SHARE_THROTTLE, skipIf: context => !isShareCreation(context) },
    { ...ROOM_AUTH_THROTTLE, skipIf: context => !isRoomAuth(context) },
  ],
  generateKey: (_context, tracker, throttlerName) => `${throttlerName}-${tracker}`,
}
