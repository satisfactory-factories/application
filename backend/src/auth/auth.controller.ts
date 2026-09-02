import { Body, Controller, HttpCode, HttpException, HttpStatus, Post, UseGuards } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { LoginResponse, MessageResponse, ValidateTokenResponse } from 'common'

import { AuthTokenPayload, isAccountTokenPayload } from './auth-token'
import { AuthService } from './auth.service'
import { CurrentUser, JwtAuthGuard } from './jwt-auth.guard'

interface CredentialsBody { username?: string, password?: string }
interface TokenBody { token?: string }
interface PasswordChangeBody { currentPassword?: string, newPassword?: string }

/**
 * Every catch-all below preserves the Express API's failure body verbatim,
 * including the serialised `error`. The web client reads `message` on all of them.
 */
@Controller()
export class AuthController {
  constructor (
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('register')
  async register (@Body() body: CredentialsBody): Promise<MessageResponse> {
    try {
      const { username, password } = body ?? {}
      return await this.authService.register(username as string, password as string)
    } catch (error) {
      if (error instanceof HttpException) throw error
      throw new HttpException({ message: 'Registration failed.', error }, HttpStatus.BAD_REQUEST)
    }
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login (@Body() body: CredentialsBody): Promise<LoginResponse> {
    try {
      const { username, password } = body ?? {}
      return await this.authService.login(username as string, password as string)
    } catch (error) {
      if (error instanceof HttpException) throw error
      throw new HttpException({ message: 'Login failed', error }, HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  @Post('validate-token')
  @HttpCode(HttpStatus.OK)
  validateToken (@Body() body: TokenBody): ValidateTokenResponse {
    const token = body?.token
    if (!token) throw new HttpException({ message: 'Token is required' }, HttpStatus.BAD_REQUEST)

    try {
      const payload: unknown = this.jwtService.verify(token)
      // A room visitor token is signed with the same secret; it is not an account token.
      if (!isAccountTokenPayload(payload)) throw new Error('not an account token')
      return { valid: true, decoded: payload }
    } catch {
      throw new HttpException(
        { valid: false, message: 'Invalid or expired token' },
        HttpStatus.UNAUTHORIZED,
      )
    }
  }

  @Post('me/password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async changePassword (
    @CurrentUser() user: AuthTokenPayload,
    @Body() body: PasswordChangeBody,
  ): Promise<MessageResponse> {
    try {
      const { currentPassword, newPassword } = body ?? {}
      return await this.authService.changePassword(
        user.id,
        currentPassword as string,
        newPassword as string,
      )
    } catch (error) {
      if (error instanceof HttpException) throw error
      throw new HttpException({ message: 'Password change failed', error }, HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }
}
