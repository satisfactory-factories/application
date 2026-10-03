import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import type { RoomRole } from 'common'

import { Room } from '../rooms/schemas/room.schema'
import { RoomMembership } from '../rooms/schemas/room-membership.schema'
import { RoomsService } from '../rooms/rooms.service'
import { membershipGrantsAccess } from '../rooms/membership-epoch'

/** An anonymous holder of a valid invite password can write content, nothing else. */
export type RoomAccessRole = RoomRole | 'visitor'

export interface RoomAccessCredentials {
  userId: string | null
  visitorToken?: string
}

/**
 * Every field an access decision reads, plus the revision a caller needs to tell a
 * client it is up to date. Deliberately not the plan: most authorizations answer a
 * message that never serialises one, and `factories` is the whole document's weight.
 */
export type RoomAccessView =
  Pick<Room, 'roomId' | 'shared' | 'deletedAt' | 'passwordHash' | 'passwordVersion' | 'membershipEpoch' | 'revision'>

const ACCESS_PROJECTION = {
  roomId: 1,
  shared: 1,
  deletedAt: 1,
  passwordHash: 1,
  passwordVersion: 1,
  membershipEpoch: 1,
  revision: 1,
} as const

/**
 * The decision and the room it is valid for, together. A snapshot may only ever be
 * built from `room`: a copy read before the check is a copy the check did not see.
 */
export type RoomAccess<TRoom = RoomAccessView> =
  | { status: 'granted', role: RoomAccessRole, room: TRoom }
  | { status: 'missing' }
  | { status: 'deleted' }
  | { status: 'denied' }
  /** The room kept moving under the check. Refusing is the only safe answer. */
  | { status: 'unstable' }

/** The same decision, carrying the whole plan. Only the paths that serialise one ask for it. */
export type RoomContentAccess = RoomAccess<Room>

/** Re-reads before an unstable room is refused rather than guessed at. */
const CONSISTENT_READ_ATTEMPTS = 3

/**
 * The plan's join rules, in one place because they are re-run on every mutating
 * op and again whenever the rooms domain revokes access.
 */
@Injectable()
export class RoomAccessService {
  constructor (
    @InjectModel(Room.name) private readonly rooms: Model<Room>,
    @InjectModel(RoomMembership.name) private readonly memberships: Model<RoomMembership>,
    private readonly roomsService: RoomsService,
  ) {}

  /**
   * The one authorization operation. Reading the room and reading the membership
   * are two operations, so an unshare landing between them leaves a voided row
   * granting access against the copy from before it — and that copy is what the
   * caller would then serialize. Re-reading the room and comparing the fields the
   * decision consumed closes that window, and the room handed back is the one the
   * decision is true of.
   */
  authorize (roomId: string, credentials: RoomAccessCredentials): Promise<RoomAccess> {
    return this.decide(roomId, credentials, false)
  }

  /** For join, op apply and every rejection that answers with a snapshot. */
  authorizeWithContent (roomId: string, credentials: RoomAccessCredentials): Promise<RoomContentAccess> {
    return this.decide(roomId, credentials, true) as Promise<RoomContentAccess>
  }

  private async decide (
    roomId: string,
    credentials: RoomAccessCredentials,
    withContent: boolean,
  ): Promise<RoomAccess> {
    for (let attempt = 0; attempt < CONSISTENT_READ_ATTEMPTS; attempt++) {
      // Always projected: the rules read access fields alone, and this copy is never
      // the one handed back.
      const before = await this.rooms.findOne({ roomId }, ACCESS_PROJECTION).lean()
      if (!before) return { status: 'missing' }
      if (before.deletedAt !== null) return { status: 'deleted' }

      const role = await this.resolve(before, credentials)

      const after = withContent
        ? await this.rooms.findOne({ roomId }).lean()
        : await this.rooms.findOne({ roomId }, ACCESS_PROJECTION).lean()
      if (!after) return { status: 'missing' }
      if (!sameAccessState(before, after)) continue

      if (!role) return { status: 'denied' }
      return { status: 'granted', role, room: after }
    }

    return { status: 'unstable' }
  }

  /**
   * The rules themselves, against one copy of the room. Not an authorization on its
   * own — only `authorize` knows whether that copy still stands — so callers go
   * through it rather than here.
   */
  async resolve (room: RoomAccessView, credentials: RoomAccessCredentials): Promise<RoomAccessRole | null> {
    if (room.deletedAt !== null) return null

    if (credentials.userId !== null) {
      const membership = await this.memberships
        .findOne({ userId: credentials.userId, roomId: room.roomId })
        .lean()
      // A membership outranks the password: a member is never re-prompted. A row
      // an unshare voided grants nothing, however long it survives the cleanup.
      if (membership && membershipGrantsAccess(membership, room)) return membership.role
    }

    if (!room.shared) return null
    if (room.passwordHash === null) return 'visitor'

    const payload = credentials.visitorToken
      ? this.roomsService.verifyVisitorToken(credentials.visitorToken)
      : null
    if (!payload || payload.roomId !== room.roomId) return null
    // Rotation bumps passwordVersion, which is what kills outstanding tokens.
    if (payload.passwordVersion !== room.passwordVersion) return null

    return 'visitor'
  }
}

/** Every field an access decision reads. A change to any of them voids the decision. */
const sameAccessState = (before: RoomAccessView, after: RoomAccessView): boolean =>
  before.membershipEpoch === after.membershipEpoch &&
  before.passwordVersion === after.passwordVersion &&
  before.shared === after.shared &&
  (before.deletedAt?.getTime() ?? null) === (after.deletedAt?.getTime() ?? null)
