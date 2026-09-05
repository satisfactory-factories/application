import { Controller, Get, Header, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'

import { MetricsService } from './metrics.service'
import { MetricsTokenGuard } from './metrics-token.guard'
import { SkipVersionGate } from '../common/decorators/skip-version-gate.decorator'

@Controller('metrics')
export class MetricsController {
  constructor (private readonly metrics: MetricsService) {}

  /**
   * The Prometheus scrape target, in the text exposition format.
   *
   * Exempt from the version gate for the same reason `/health` is: the caller is a
   * scraper, not a planner, and it has no `X-App-Version` to send. It has its own rate
   * limit bucket too, so ordinary traffic can never throttle a scrape into a gap in the
   * graphs, and a scrape can never eat the allowance real requests share.
   */
  @Get()
  @SkipVersionGate()
  @UseGuards(MetricsTokenGuard)
  @Header('Cache-Control', 'no-store')
  async scrape (@Res({ passthrough: true }) res: Response): Promise<string> {
    res.type(this.metrics.contentType)
    return this.metrics.render()
  }
}
