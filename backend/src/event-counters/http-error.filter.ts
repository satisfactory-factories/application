import { ACCEPTED_VERSION_HEADERS } from 'common'
import { ArgumentsHost, Catch, HttpException } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import type { Request } from 'express'

import { BackoffException } from './backoff.exception'
import { EventCountersService } from './event-counters.service'
import type { HttpErrorClient, HttpErrorLabels } from './event-counters.service'

/** Routes the planner calls without a version header, so a headerless hit is still the planner. */
const BEACON_ROUTES = new Set(['POST /events', 'POST /telemetry'])

export const UNMATCHED_ROUTE = 'unmatched'

/**
 * Express sets `req.route` when a route layer dispatches, so it is present for anything thrown
 * from a guard, pipe or handler and absent only when the router found nothing. The pattern is
 * bounded by the controllers; the raw path is bounded by whoever is probing.
 */
export const describeRequest = (request: Request): HttpErrorLabels => {
  const pattern = (request.route as { path?: unknown } | undefined)?.path
  const route = typeof pattern === 'string' ? `${request.method} ${pattern}` : UNMATCHED_ROUTE

  const versioned = ACCEPTED_VERSION_HEADERS.some(name => request.header(name) !== undefined)
  let client: HttpErrorClient = 'unversioned'
  if (versioned) client = 'versioned'
  else if (BEACON_ROUTES.has(route)) client = 'beacon'

  return { client, route }
}

/**
 * Counts every HTTP error response, then hands the exception straight back to Nest.
 *
 * **It extends `BaseExceptionFilter` and calls `super.catch()`.** It does not record and
 * re-throw: a filter owns exception handling, and throwing back out of one is not a defined
 * delegation and can leave the request hanging. `super.catch()` is the documented way to wrap
 * the default handler, so every status and body stays exactly as it was.
 *
 * **Scope.** The HTTP pipeline only. It does not see WebSocket gateway errors, the hourly
 * sweeper, or anything thrown outside a request, which is why those places increment
 * `sf_events_total` by name instead. The two halves are complementary.
 *
 * A named reason and this filter can both count one incident: slug exhaustion increments
 * `slug_allocation_exhausted` and then throws a 503 that lands here. That is intended. They
 * are a per-cause view and a per-response view, and must not be added together.
 */
@Catch()
export class HttpErrorFilter extends BaseExceptionFilter {
  constructor (private readonly counters: EventCountersService) {
    super()
  }

  override catch (exception: unknown, host: ArgumentsHost): void {
    // Only HTTP. A gateway exception reaching here would otherwise be counted as a response
    // that was never sent.
    if (host.getType() === 'http') {
      if (exception instanceof BackoffException) {
        this.counters.recordBackoff(exception.endpoint, exception.reason)
      } else {
        const status = exception instanceof HttpException ? exception.getStatus() : 500
        this.counters.recordHttpError(status, describeRequest(host.switchToHttp().getRequest<Request>()))
      }
    }

    super.catch(exception, host)
  }
}
