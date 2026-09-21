import { HttpException, HttpStatus } from '@nestjs/common'

import type { BackoffEndpoint, BackoffReason } from './event-counters.service'

/**
 * A 429 that is the rate limit working, not a fault. `HttpErrorFilter` counts it under
 * `sf_backoffs_total` instead of `sf_http_errors_total`. Still a 429 on the wire: the
 * events client keeps its batch for the next tick on any non-2xx, and a 204 would have
 * told it the counts were taken when they were dropped.
 */
export class BackoffException extends HttpException {
  constructor (
    readonly endpoint: BackoffEndpoint,
    readonly reason: BackoffReason,
    message: string,
  ) {
    super(message, HttpStatus.TOO_MANY_REQUESTS)
  }
}
