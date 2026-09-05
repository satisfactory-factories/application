import { APP_VERSION_HEADER, PROTOCOL_VERSION } from 'common'
import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { VersionMismatchBody } from 'common'
import type { Request } from 'express'

import { SKIP_VERSION_GATE } from '../decorators/skip-version-gate.decorator'

/** 426 Upgrade Required; @nestjs/common's HttpStatus has no member for it. */
export const UPGRADE_REQUIRED = 426

@Injectable()
export class VersionGateGuard implements CanActivate {
  constructor (private readonly reflector: Reflector) {}

  canActivate (context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_VERSION_GATE, [
      context.getHandler(),
      context.getClass(),
    ])
    if (skip) return true

    const request = context.switchToHttp().getRequest<Request>()
    // Preflights never carry the header they are asking permission for.
    if (request.method === 'OPTIONS') return true

    const received = request.header(APP_VERSION_HEADER) ?? null
    if (received === PROTOCOL_VERSION) return true

    const body: VersionMismatchBody = {
      code: 'version_mismatch',
      message: 'This version of the planner is out of date. Please refresh the page.',
      requiredVersion: PROTOCOL_VERSION,
      receivedVersion: received,
    }
    throw new HttpException(body, UPGRADE_REQUIRED)
  }
}
