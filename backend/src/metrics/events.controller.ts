import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common'
import { EVENT_CAPS, parseEventReport } from 'common'
import { HttpException, PayloadTooLargeException } from '@nestjs/common'
import type { Request } from 'express'

import { EventCountersService } from '../event-counters/event-counters.service'
import { SkipVersionGate } from '../common/decorators/skip-version-gate.decorator'
import { TelemetryService } from './telemetry.service'

/**
 * Bounds what is stored and counted, not what is allocated: `bootstrap.ts` installs one global
 * JSON parser at 20MB, so a large body has already been read by the time this runs. Worth
 * being straight about on an unauthenticated route. The throttler bucket is what bounds rate.
 */
const assertWithinCap = (request: Request, body: unknown): void => {
  const declared = Number(request.header('content-length') ?? 0)
  if (Number.isFinite(declared) && declared > EVENT_CAPS.bodyBytes) throw new PayloadTooLargeException()
  if (Buffer.byteLength(JSON.stringify(body ?? null), 'utf8') > EVENT_CAPS.bodyBytes) {
    throw new PayloadTooLargeException()
  }
}

@Controller('events')
export class EventsController {
  constructor (
    private readonly counters: EventCountersService,
    private readonly telemetry: TelemetryService,
  ) {}

  /**
   * A batch of fault counts from one browser.
   *
   * Unauthenticated and version-gate exempt for the same reasons `/telemetry` is: the clients
   * most worth hearing from are the broken and the out-of-date ones.
   *
   * The reason is a closed enum, so nothing a caller sends can become a new Prometheus label.
   * That is the only thing standing between this route and unbounded cardinality.
   */
  @Post()
  @SkipVersionGate()
  @HttpCode(HttpStatus.NO_CONTENT)
  async report (@Req() request: Request, @Body() body: unknown): Promise<void> {
    assertWithinCap(request, body)

    const parsed = parseEventReport(body)
    if (!parsed.success) throw new BadRequestException('Malformed event report.')

    // Reuses the heartbeat's per-instance floor, so one browser cannot flush faster than the
    // interval however hard it tries. Refusing here rather than in the counter service keeps
    // that service dependency-free.
    if (!await this.telemetry.allowEventReport(parsed.data.instanceId)) {
      throw new HttpException('Too many event reports.', HttpStatus.TOO_MANY_REQUESTS)
    }

    for (const { reason, count } of parsed.data.events) {
      this.counters.record('client', reason, count)
    }
  }
}
