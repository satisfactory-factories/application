import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, createParamDecorator } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'

import { AuthTokenPayload, AuthenticatedRequest } from './auth-token'

const unauthorized = (): HttpException =>
  new HttpException({ message: 'Unauthorized' }, HttpStatus.UNAUTHORIZED)

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor (private readonly jwtService: JwtService) {}

  canActivate (context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const token = request.header('Authorization')?.replace('Bearer ', '')
    if (!token) throw unauthorized()

    try {
      request.user = this.jwtService.verify<AuthTokenPayload>(token)
    } catch (error) {
      if (error instanceof Error && error.message) console.log(error.message)
      throw unauthorized()
    }

    return true
  }
}

/** Attaches the user when a valid token is present, and lets anonymous through. */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor (private readonly jwtService: JwtService) {}

  canActivate (context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const token = request.header('Authorization')?.replace('Bearer ', '')
    if (!token) return true

    try {
      request.user = this.jwtService.verify<AuthTokenPayload>(token)
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
