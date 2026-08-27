import type { ExecutionContext } from '@nestjs/common'
import type { ThrottlerModuleOptions } from '@nestjs/throttler'
import type { Request } from 'express'

export const HEALTH_PATH = '/health'

export const GLOBAL_THROTTLE = { name: 'global', ttl: 5 * 60 * 1000, limit: 200 } as const
export const HEALTH_THROTTLE = { name: 'health', ttl: 60 * 1000, limit: 10 } as const

const isHealthRequest = (context: ExecutionContext): boolean =>
  context.getType() === 'http' &&
  context.switchToHttp().getRequest<Request>().path === HEALTH_PATH

/**
 * Two buckets, mirroring the express-rate-limit setup this replaces: /health is
 * exempt from the global one so ordinary traffic can never rate-limit the uptime
 * monitor into reporting a false outage. `generateKey` drops the per-handler
 * suffix Nest adds by default, which would otherwise give every route its own
 * allowance instead of one shared allowance per client.
 */
export const THROTTLER_OPTIONS: ThrottlerModuleOptions = {
  throttlers: [
    { ...GLOBAL_THROTTLE, skipIf: isHealthRequest },
    { ...HEALTH_THROTTLE, skipIf: context => !isHealthRequest(context) },
  ],
  generateKey: (_context, tracker, throttlerName) => `${throttlerName}-${tracker}`,
}
