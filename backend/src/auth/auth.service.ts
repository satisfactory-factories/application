import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectModel } from '@nestjs/mongoose'
import bcrypt from 'bcryptjs'
import { Model } from 'mongoose'

import { User, UserDocument } from './user.schema'
import { UserActivityService } from '../user-activity/user-activity.service'
import { EventCountersService } from '../event-counters/event-counters.service'

/** Matches the Express API exactly; changing it changes who can register. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const MAX_USERNAME_LENGTH = 100
export const MAX_PASSWORD_LENGTH = 100
const BCRYPT_ROUNDS = 10

export const isEmailAddress = (input: string): boolean => EMAIL_PATTERN.test(input)

const badRequest = (message: string): HttpException =>
  new HttpException({ message }, HttpStatus.BAD_REQUEST)

@Injectable()
export class AuthService {
  constructor (
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly jwtService: JwtService,
    private readonly userActivity: UserActivityService,
    private readonly counters: EventCountersService,) {}

  async register (username: string, password: string): Promise<{ message: string }> {
    if (username.length > MAX_USERNAME_LENGTH) throw badRequest('Username too long.')
    if (password.length > MAX_PASSWORD_LENGTH) throw badRequest('Password too long.')
    if (isEmailAddress(username)) {
      throw badRequest('Please do not register with an email address. We do not wish to store PII.')
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS)

    const existingUser = await this.userModel.findOne({ username })
    if (existingUser) throw badRequest('User already exists.')

    await new this.userModel({ username, password: hashedPassword }).save()
    console.log(`Successfully registered new user ${username}!`)

    return { message: 'User registered successfully!' }
  }

  async login (username: string, password: string): Promise<{ token: string }> {
    const user = await this.userModel.findOne({ username })
    if (!user) throw badRequest('Invalid credentials')

    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) throw badRequest('Invalid credentials')

    const token = await this.jwtService.signAsync({ id: user._id, username: user.username })
    console.log(`Successfully signed in user ${username}`)

    // Stamped after the token is issued and allowed to fail: a metrics write must never be
    // the reason somebody cannot sign in.
    try {
      await this.userActivity.recordSignIn(String(user._id), new Date())
    } catch (cause) {
      console.error(`Failed to stamp the sign-in for ${username}`, cause)
      this.counters.record('server', 'post_commit_signin_stamp_lost')
    }

    return { token }
  }

  async changePassword (userId: string, currentPassword: string, newPassword: string): Promise<{ message: string }> {
    if (!currentPassword || !newPassword) throw badRequest('Current and new password are required.')
    if (newPassword.length > MAX_PASSWORD_LENGTH) throw badRequest('Password too long.')

    const user = await this.userModel.findById(userId) as UserDocument | null
    if (!user) throw new HttpException({ message: 'Unauthorized' }, HttpStatus.UNAUTHORIZED)

    const isMatch = await bcrypt.compare(currentPassword, user.password)
    if (!isMatch) throw badRequest('Invalid credentials')

    user.password = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
    await user.save()
    console.log(`Password changed for ${user.username}`)

    return { message: 'Password changed successfully!' }
  }
}
