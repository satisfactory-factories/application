import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, createParamDecorator } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'

import { AccountTokenService } from './account-token.service'
import { AuthTokenPayload, AuthenticatedRequest, isAccountTokenPayload } from './auth-token'

const unauthorized = (): HttpException =>
  new HttpException({ message: 'Unauthorized' }, HttpStatus.UNAUTHORIZED)

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor (
    private readonly jwtService: JwtService,
    private readonly accounts: AccountTokenService,
  ) {}

  async canActivate (context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const token = request.header('Authorization')?.replace('Bearer ', '')
    if (!token) throw unauthorized()

    let payload: unknown
    try {
      payload = this.jwtService.verify(token)
    } catch (error) {
      if (error instanceof Error && error.message) console.log(error.message)
      throw unauthorized()
    }

    // A room visitor token verifies against the same secret and is not an account.
    if (!isAccountTokenPayload(payload)) throw unauthorized()

    // A signature alone cannot say the token is still wanted: a password change bumps the
    // account's generation, and one projected `_id` read per request is what enforces it.
    if (!await this.accounts.isCurrent(payload)) throw unauthorized()

    request.user = payload
    return true
  }
}

/** Attaches the user when a valid token is present, and lets anonymous through. */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor (
    private readonly jwtService: JwtService,
    private readonly accounts: AccountTokenService,
  ) {}

  async canActivate (context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const token = request.header('Authorization')?.replace('Bearer ', '')
    if (!token) return true

    try {
      const payload: unknown = this.jwtService.verify(token)
      // Anything that is not an account token is treated as no token, visitor tokens and
      // superseded ones included.
      if (isAccountTokenPayload(payload) && await this.accounts.isCurrent(payload)) {
        request.user = payload
      }
    } catch {
      // A bad token is treated as no token: this guard never rejects.
    }

    return true
  }
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthTokenPayload => {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user
    if (!user) throw unauthorized()
    return user
  },
)

export const OptionalUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthTokenPayload | null =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user ?? null,
)
