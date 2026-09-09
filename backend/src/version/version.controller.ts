import { Controller, Get, Header } from '@nestjs/common'

import { SkipVersionGate } from '../common/decorators/skip-version-gate.decorator'
import { appVersion } from './app-version'

export interface VersionResponse {
  version: string
}

@Controller('version')
export class VersionController {
  /**
   * What the site is currently running, so a planner tab can poll for a release and offer a
   * reload rather than finding out when a save is refused (issue #166). Public and
   * unauthenticated: most of the people who want telling do not have an account.
   *
   * Exempt from the version gate by definition. Its whole job is to tell an out-of-date client
   * that a newer build exists, and the gate refuses exactly those clients.
   */
  @Get()
  @SkipVersionGate()
  // A cached copy defeats the entire point of polling.
  @Header('Cache-Control', 'no-store')
  version (): VersionResponse {
    return { version: appVersion() }
  }
}
