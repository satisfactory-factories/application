import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common'
import { PayloadTooLargeException } from '@nestjs/common'
import { TELEMETRY_CAPS, parseTelemetryHeartbeat } from 'common'
import type { Request } from 'express'

import { SkipVersionGate } from '../common/decorators/skip-version-gate.decorator'
import { EventCountersService } from '../event-counters/event-counters.service'
import { TelemetryService } from './telemetry.service'

/**
 * The global body parser allows 20MB, which is right for a plan and absurd for this. The
 * declared length is checked first so an oversized body is refused on its header, and the
 * parsed body is measured too because `Content-Length` is the sender's claim, not a fact.
 */
const assertWithinCap = (request: Request, body: unknown): void => {
  const declared = Number(request.header('content-length') ?? 0)
  if (Number.isFinite(declared) && declared > TELEMETRY_CAPS.bodyBytes) {
    throw new PayloadTooLargeException()
  }
  if (Buffer.byteLength(JSON.stringify(body ?? null), 'utf8') > TELEMETRY_CAPS.bodyBytes) {
    throw new PayloadTooLargeException()
  }
}

@Controller('telemetry')
export class TelemetryController {
  constructor (
    private readonly telemetry: TelemetryService,
    private readonly counters: EventCountersService,
  ) {}

  /**
   * The anonymous usage heartbeat. Unauthenticated by design — the users this exists to
   * count are exactly the ones with no account — and exempt from the version gate, so a
   * client too old to write still reports the fact that it is running.
   *
   * 204, always empty. The browser is told nothing it could act on, and asks for nothing
   * back; see `common/src/schemas/telemetry.ts` for what may be in the body and why.
   */
  @Post()
  @SkipVersionGate()
  @HttpCode(HttpStatus.NO_CONTENT)
  async heartbeat (@Req() request: Request, @Body() body: unknown): Promise<void> {
    assertWithinCap(request, body)

    const parsed = parseTelemetryHeartbeat(body)
    if (!parsed.success) throw new BadRequestException('Malformed telemetry heartbeat.')

    const outcome = await this.telemetry.record(parsed.data)
    // A refused heartbeat is the floor working, not a fault, so it is counted as a back-off
    // and answered 204 rather than 429. Two tabs share one instance id and would otherwise
    // put a 429 on the error panel every five minutes, in ordinary use.
    if (outcome === 'too-soon') this.counters.recordBackoff('telemetry', 'too_soon')
    if (outcome === 'at-capacity') this.counters.recordBackoff('telemetry', 'at_capacity')
  }
}
