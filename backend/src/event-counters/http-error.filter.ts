import { ArgumentsHost, Catch, HttpException } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'

import { EventCountersService } from './event-counters.service'

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
      const status = exception instanceof HttpException ? exception.getStatus() : 500
      this.counters.recordHttpError(status)
    }

    super.catch(exception, host)
  }
}
