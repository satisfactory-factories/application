import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import type { RoomRole } from 'common'

import { Room } from '../rooms/schemas/room.schema'
import { RoomMembership } from '../rooms/schemas/room-membership.schema'
import { RoomsService } from '../rooms/rooms.service'

/** An anonymous holder of a valid invite password can write content, nothing else. */
export type RoomAccessRole = RoomRole | 'visitor'

export interface RoomAccessCredentials {
  userId: string | null
  visitorToken?: string
}

/**
 * The plan's join rules, in one place because they are re-run on every mutating
 * op and again whenever the rooms domain revokes access.
 */
@Injectable()
export class RoomAccessService {
  constructor (
    @InjectModel(RoomMembership.name) private readonly memberships: Model<RoomMembership>,
    private readonly rooms: RoomsService,
  ) {}

  /** `null` means no access. A tombstoned room is never accessible to anyone. */
  async resolve (room: Room, credentials: RoomAccessCredentials): Promise<RoomAccessRole | null> {
    if (room.deletedAt !== null) return null

    if (credentials.userId !== null) {
      const membership = await this.memberships
        .findOne({ userId: credentials.userId, roomId: room.roomId })
        .lean()
      // A membership outranks the password: a member is never re-prompted.
      if (membership) return membership.role
    }

    if (!room.shared) return null
    if (room.passwordHash === null) return 'visitor'

    const payload = credentials.visitorToken
      ? this.rooms.verifyVisitorToken(credentials.visitorToken)
      : null
    if (!payload || payload.roomId !== room.roomId) return null
    // Rotation bumps passwordVersion, which is what kills outstanding tokens.
    if (payload.passwordVersion !== room.passwordVersion) return null

    return 'visitor'
  }
}
