import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'

import { AuthTokenPayload } from './auth-token'
import { User } from './user.schema'

/** Everything the handshake wants off the account, from one projected read. */
export interface AccountState {
  tokenVersion: number
  roomsRevision: number
}

/**
 * A token minted before versioning existed carries no claim, and an account that has never
 * changed its password stores no field. Both read as generation 0, so no existing session
 * is ended by the deploy; the first password change is what starts versioning that account.
 */
export const tokenVersionMatches = (
  claim: number | null | undefined,
  stored: number | null | undefined,
): boolean => (claim ?? 0) === (stored ?? 0)

@Injectable()
export class AccountTokenService {
  constructor (@InjectModel(User.name) private readonly users: Model<User>) {}

  /** One field and no document body: the guards run this on every authenticated request. */
  async tokenVersionOf (userId: string): Promise<number | null> {
    if (!Types.ObjectId.isValid(userId)) return null
    const user = await this.users.findById(userId, { tokenVersion: 1 }).lean()
    return user ? user.tokenVersion ?? 0 : null
  }

  /** The handshake needs both numbers, so it reads them together rather than twice. */
  async accountState (userId: string): Promise<AccountState | null> {
    if (!Types.ObjectId.isValid(userId)) return null
    const user = await this.users.findById(userId, { tokenVersion: 1, roomsRevision: 1 }).lean()
    if (!user) return null
    return { tokenVersion: user.tokenVersion ?? 0, roomsRevision: user.roomsRevision ?? 0 }
  }

  /** False for a superseded token, and for an account that no longer exists. */
  async isCurrent (payload: AuthTokenPayload): Promise<boolean> {
    const stored = await this.tokenVersionOf(payload.id)
    return stored !== null && tokenVersionMatches(payload.tokenVersion, stored)
  }
}
