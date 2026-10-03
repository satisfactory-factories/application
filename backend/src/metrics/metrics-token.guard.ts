import { createHash, timingSafeEqual } from 'node:crypto'

import { CanActivate, ExecutionContext, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import type { Request } from 'express'

import { METRICS_TOKEN_VAR } from './metrics.constants'

/** Digested first so the comparison is over two equal-length buffers whatever was sent. */
const digest = (value: string): Buffer => createHash('sha256').update(value).digest()

const matches = (presented: string, expected: string): boolean =>
  timingSafeEqual(digest(presented), digest(expected))

const bearer = (request: Request): string | null => {
  const header = request.header('authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null
}

/**
 * The only thing in front of `/metrics`.
 *
 * Two refusals, and the order of them is the point. With no `METRICS_TOKEN` set the route
 * answers **404**, exactly as though it were not mounted — a box that never got the
 * variable exposes room counts to nobody, rather than to everybody. Only once a token
 * exists does the endpoint admit to being there and start answering **401**.
 *
 * That does mean the 404 is checked before the credential, so a correct token against an
 * unconfigured box still reads as "no such route". That is the safe direction.
 */
@Injectable()
export class MetricsTokenGuard implements CanActivate {
  canActivate (context: ExecutionContext): boolean {
    const expected = process.env[METRICS_TOKEN_VAR]?.trim()
    if (!expected) throw new NotFoundException()

    const presented = bearer(context.switchToHttp().getRequest<Request>())
    if (presented === null || !matches(presented, expected)) {
      throw new UnauthorizedException('A valid metrics bearer token is required.')
    }

    return true
  }
}
