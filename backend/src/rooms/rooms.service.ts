import { randomUUID } from 'node:crypto'

import { CAPS } from 'common'
import { HttpStatus, Inject, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { JwtService } from '@nestjs/jwt'
import { Model, Types } from 'mongoose'
import bcrypt from 'bcryptjs'
import type {
  CreateRoomBody,
  EnsureRoomResult,
  EnsureRoomStatus,
  JoinRoomResult,
  RoomListEntry,
  RoomListResponse,
  RoomMeta,
  RoomRole,
  RoomSlugLookup,
} from 'common'

import { ANONYMOUS_ACTOR, RoomActivityService } from './room-activity.service'
import { CLOCK, Clock } from './clock'
import { EnsureStepRunner } from './ensure-step.runner'
import { Room } from './schemas/room.schema'
import { RoomActivityKind } from './schemas/room-activity.schema'
import { RoomEventsService } from './room-events.service'
import { RoomMembership } from './schemas/room-membership.schema'
import { User } from '../auth/user.schema'
import { VISITOR_TOKEN_TTL, VisitorTokenPayload, isVisitorTokenPayload } from './visitor-token'
import { forbidden, isDuplicateKey, notFound, roomError } from './room-errors'
import { generateSlug } from './slug'

/** Invite-password hashing cost. Higher than the account cost: a room password is short. */
export const INVITE_BCRYPT_ROUNDS = 12

/** How many slugs to try before giving up on allocating an invite link. */
const SLUG_ATTEMPTS = 5

@Injectable()
export class RoomsService {
  constructor (
    @InjectModel(Room.name) private readonly rooms: Model<Room>,
    @InjectModel(RoomMembership.name) private readonly memberships: Model<RoomMembership>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly steps: EnsureStepRunner,
    private readonly events: RoomEventsService,
    private readonly activity: RoomActivityService,
    private readonly jwt: JwtService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // ===== Reads =====

  async listRooms (userId: string): Promise<RoomListResponse> {
    const memberships = await this.memberships.find({ userId }).sort({ order: 1 }).lean()
    const rooms = await this.rooms
      .find({ roomId: { $in: memberships.map(m => m.roomId) }, deletedAt: null })
      .lean()

    const byId = new Map(rooms.map(room => [room.roomId, room]))

    return {
      roomsRevision: await this.roomsRevisionOf(userId),
      // Tombstoned rooms are simply absent: the membership row outlives the
      // tombstone until the sweeper runs, and must not show a dead tab.
      rooms: memberships
        .filter(membership => byId.has(membership.roomId))
        .map(membership => toListEntry(byId.get(membership.roomId) as Room, membership.role, membership.order)),
    }
  }

  async lookupBySlug (slug: string): Promise<RoomSlugLookup> {
    const room = await this.rooms.findOne({ slug, shared: true, deletedAt: null }).lean()
    if (!room) throw notFound()

    return { roomId: room.roomId, name: room.name, hasPassword: room.passwordHash !== null }
  }

  // ===== Create and adopt =====

  /**
   * The plan's ensure-chain: ensure room, ensure membership, bump, log. Create-only
   * throughout, so a retry of any step resumes rather than overwriting content.
   */
  async ensureRoom (
    userId: string,
    input: CreateRoomBody,
    kind: Extract<RoomActivityKind, 'created' | 'adopted' | 'imported'>,
  ): Promise<EnsureRoomResult> {
    const roomId = input.roomId ?? randomUUID()

    const { room, created } = await this.steps.run('ensure-room', () =>
      this.insertRoomIfAbsent(userId, roomId, input))

    const hadMembership = (await this.memberships.findOne({ userId, roomId }).lean()) !== null
    if (!hadMembership) {
      await this.assertMembershipCapacity(userId)
      await this.steps.run('ensure-membership', () =>
        this.insertMembershipIfAbsent(userId, roomId, 'owner'))
    }

    // Both tails run unconditionally: a retry after a failure between them is the
    // only way the bump and the log ever land, and both are idempotent.
    await this.steps.run('bump-rooms-revision', () => this.bumpRoomsRevision([userId]))
    await this.steps.run('record-activity', () => this.activity.recordOnce(roomId, userId, kind))

    const status: EnsureRoomStatus = created ? 'created' : hadMembership ? 'already_exists' : 'resumed'
    this.events.emit('rooms_changed', { userIds: [userId] })

    const membership = await this.memberships.findOne({ userId, roomId }).lean()
    return { status, room: toListEntry(room, membership?.role ?? 'owner', membership?.order ?? 0) }
  }

  // ===== Meta mutations =====

  async rename (userId: string, roomId: string, name: string): Promise<RoomListEntry> {
    await this.requireOwner(userId, roomId)

    await this.steps.run('update-room-meta', async () => {
      await this.rooms.updateOne({ roomId }, { $set: { name } })
    })

    return this.finishMetaMutation(userId, roomId, 'renamed')
  }

  async share (userId: string, roomId: string, requestedSlug?: string): Promise<RoomListEntry> {
    const room = await this.requireOwner(userId, roomId)

    await this.steps.run('update-room-meta', () => this.assignSlugAndShare(room, requestedSlug))

    return this.finishMetaMutation(userId, roomId, 'shared')
  }

  /** The "make it private again" lever: kicks every collaborator, keeps their data local. */
  async unshare (userId: string, roomId: string): Promise<RoomListEntry> {
    await this.requireOwner(userId, roomId)

    await this.steps.run('update-room-meta', async () => {
      await this.rooms.updateOne({ roomId }, { $set: { shared: false } })
    })

    // Bump before the removal so a failure between the two only costs a repeat
    // bump on retry, never a member left with a stale list and no notification.
    const affected = await this.memberIds(roomId)
    await this.steps.run('bump-rooms-revision', () => this.bumpRoomsRevision(affected))
    await this.steps.run('remove-memberships', async () => {
      await this.memberships.deleteMany({ roomId, role: 'member' })
    })
    await this.steps.run('record-activity', () => this.activity.record(roomId, userId, 'unshared'))

    this.events.emit('room_meta', { roomId })
    this.events.emit('access_revoked', { roomId, scope: 'non-owners' })
    this.events.emit('rooms_changed', { userIds: affected })

    return this.entryFor(userId, roomId)
  }

  async setPassword (userId: string, roomId: string, password: string): Promise<number> {
    await this.requireOwner(userId, roomId)
    const passwordHash = await bcrypt.hash(password, INVITE_BCRYPT_ROUNDS)

    await this.steps.run('update-room-meta', async () => {
      // Every change bumps passwordVersion, which is what kills outstanding
      // visitor tokens. Rotation and first set are the same write.
      await this.rooms.updateOne({ roomId }, { $set: { passwordHash }, $inc: { passwordVersion: 1 } })
    })

    await this.finishMetaMutation(userId, roomId, 'password_set')
    this.events.emit('access_revoked', { roomId, scope: 'visitors' })

    return (await this.requireRoom(roomId)).passwordVersion
  }

  async removePassword (userId: string, roomId: string): Promise<number> {
    await this.requireOwner(userId, roomId)

    await this.steps.run('update-room-meta', async () => {
      await this.rooms.updateOne({ roomId }, { $set: { passwordHash: null }, $inc: { passwordVersion: 1 } })
    })

    await this.finishMetaMutation(userId, roomId, 'password_removed')
    this.events.emit('access_revoked', { roomId, scope: 'visitors' })

    return (await this.requireRoom(roomId)).passwordVersion
  }

  /** Tombstone first: one owner-authorised write makes the room inert forever. */
  async deleteRoom (userId: string, roomId: string): Promise<void> {
    const room = await this.requireRoom(roomId, { includeDeleted: true })

    if (room.deletedAt === null) {
      await this.requireOwner(userId, roomId)
      await this.steps.run('tombstone-room', async () => {
        await this.rooms.updateOne(
          { roomId, deletedAt: null },
          { $set: { deletedAt: this.clock.now(), shared: false, slug: null } },
        )
      })
      this.events.emit('room_deleted', { roomId })
    } else if (room.createdBy !== userId) {
      // Resuming is authorised by the tombstone plus the room's own createdBy,
      // because the owner's membership may already have been cleaned up.
      throw forbidden()
    }

    const affected = await this.memberIds(roomId)
    await this.steps.run('bump-rooms-revision', () => this.bumpRoomsRevision(affected))
    await this.steps.run('remove-memberships', async () => {
      await this.memberships.deleteMany({ roomId })
    })
    await this.steps.run('record-activity', () => this.activity.recordOnce(roomId, userId, 'deleted'))

    this.events.emit('rooms_changed', { userIds: affected })
  }

  // ===== Membership =====

  async reorder (userId: string, roomIds: string[]): Promise<RoomListResponse> {
    const mine = new Set((await this.memberships.find({ userId }).lean()).map(m => m.roomId))
    const unknown = roomIds.find(roomId => !mine.has(roomId))
    if (unknown) throw notFound()

    await this.steps.run('reorder-memberships', async () => {
      await this.memberships.bulkWrite(roomIds.map((roomId, order) => ({
        updateOne: { filter: { userId, roomId }, update: { $set: { order } } },
      })))
    })
    await this.steps.run('bump-rooms-revision', () => this.bumpRoomsRevision([userId]))

    this.events.emit('rooms_changed', { userIds: [userId] })

    return this.listRooms(userId)
  }

  async leave (userId: string, roomId: string): Promise<void> {
    await this.requireRoom(roomId, { includeDeleted: true })
    const membership = await this.memberships.findOne({ userId, roomId }).lean()
    if (!membership) throw forbidden()
    if (membership.role === 'owner') {
      throw roomError(
        'owner_cannot_leave',
        'The owner cannot leave their own room; delete it instead.',
        HttpStatus.BAD_REQUEST,
      )
    }

    // The membership row goes last: while it survives, a retry can still tell that
    // the leave is unfinished and replay the bump.
    await this.steps.run('bump-rooms-revision', () => this.bumpRoomsRevision([userId]))
    await this.steps.run('record-activity', () => this.activity.record(roomId, userId, 'left'))
    await this.steps.run('remove-membership', async () => {
      await this.memberships.deleteOne({ userId, roomId })
    })

    this.events.emit('rooms_changed', { userIds: [userId] })
  }

  async join (userId: string, roomId: string, visitorToken?: string): Promise<JoinRoomResult> {
    const room = await this.requireRoom(roomId)
    if (!room.shared) throw roomError('not_shared', 'This room is not shared.', HttpStatus.FORBIDDEN)

    const existing = await this.memberships.findOne({ userId, roomId }).lean()
    if (existing) {
      return { status: 'already_member', room: toListEntry(room, existing.role, existing.order) }
    }

    // A logged-in joiner clears the password once; the membership is durable
    // afterwards, so a later rotation does not lock them out.
    if (room.passwordHash !== null) this.assertVisitorToken(room, visitorToken)

    await this.assertMembershipCapacity(userId)
    // Same reasoning as leave, inverted: the membership row is written last, so
    // its absence is what tells a retry the join is unfinished.
    await this.steps.run('bump-rooms-revision', () => this.bumpRoomsRevision([userId]))
    await this.steps.run('record-activity', () => this.activity.record(roomId, userId, 'joined'))
    await this.steps.run('ensure-membership', () =>
      this.insertMembershipIfAbsent(userId, roomId, 'member'))

    this.events.emit('rooms_changed', { userIds: [userId] })

    return { status: 'joined', room: await this.entryFor(userId, roomId) }
  }

  // ===== Visitor tokens =====

  async authenticate (roomId: string, password: string): Promise<string> {
    const room = await this.requireRoom(roomId)
    if (!room.shared) throw roomError('not_shared', 'This room is not shared.', HttpStatus.FORBIDDEN)
    if (room.passwordHash === null) {
      throw roomError('no_password_set', 'This room has no password.', HttpStatus.BAD_REQUEST)
    }

    if (!await bcrypt.compare(password, room.passwordHash)) {
      throw roomError('invalid_password', 'Incorrect password.', HttpStatus.UNAUTHORIZED)
    }

    const payload: Omit<VisitorTokenPayload, 'iat' | 'exp'> = {
      roomId,
      passwordVersion: room.passwordVersion,
      role: 'visitor',
    }

    await this.activity.record(roomId, ANONYMOUS_ACTOR, 'joined', 'visitor token issued')

    return this.jwt.signAsync(payload, { expiresIn: VISITOR_TOKEN_TTL })
  }

  verifyVisitorToken (token: string): VisitorTokenPayload | null {
    try {
      const payload: unknown = this.jwt.verify(token)
      return isVisitorTokenPayload(payload) ? payload : null
    } catch {
      return null
    }
  }

  // ===== Shared helpers, also used by the gateway and the legacy import =====

  async requireRoom (roomId: string, options: { includeDeleted?: boolean } = {}): Promise<Room> {
    const filter = options.includeDeleted ? { roomId } : { roomId, deletedAt: null }
    const room = await this.rooms.findOne(filter).lean()
    if (!room) throw notFound()
    return room
  }

  async requireOwner (userId: string, roomId: string): Promise<Room> {
    const room = await this.requireRoom(roomId)
    const membership = await this.memberships.findOne({ userId, roomId }).lean()
    if (!membership) throw forbidden()
    if (membership.role !== 'owner') {
      throw forbidden('Only the room owner can change its settings.')
    }
    return room
  }

  async memberIds (roomId: string): Promise<string[]> {
    return (await this.memberships.find({ roomId }).lean()).map(membership => membership.userId)
  }

  async roomsRevisionOf (userId: string): Promise<number> {
    if (!Types.ObjectId.isValid(userId)) return 0
    const user = await this.users.findById(userId).lean()
    return user?.roomsRevision ?? 0
  }

  async bumpRoomsRevision (userIds: string[]): Promise<void> {
    const ids = userIds.filter(id => Types.ObjectId.isValid(id)).map(id => new Types.ObjectId(id))
    if (ids.length === 0) return
    // Re-bumping is harmless by design, which is what lets the chain resume.
    await this.users.updateMany({ _id: { $in: ids } }, { $inc: { roomsRevision: 1 } })
  }

  // ===== Internals =====

  private async insertRoomIfAbsent (
    userId: string,
    roomId: string,
    input: CreateRoomBody,
  ): Promise<{ room: Room, created: boolean }> {
    const existing = await this.rooms.findOne({ roomId }).lean()
    if (existing) return { room: this.disambiguate(existing, userId), created: false }

    await this.assertRoomCapacity(userId)

    try {
      const created = await this.rooms.create({
        roomId,
        name: input.name,
        createdBy: userId,
        factories: input.factories ?? [],
        powerTarget: input.powerTarget ?? 0,
        groups: input.groups ?? [],
        lastActivityAt: this.clock.now(),
      })
      return { room: created.toObject(), created: true }
    } catch (error) {
      if (!isDuplicateKey(error)) throw error
      // Someone won the race. A duplicate key is this step's success, not a failure.
      const room = await this.rooms.findOne({ roomId }).lean()
      if (!room) throw error
      return { room: this.disambiguate(room, userId), created: false }
    }
  }

  /** The adopt collision rules: mine resumes, anyone else's makes the client re-key. */
  private disambiguate (room: Room, userId: string): Room {
    if (room.createdBy !== userId) {
      throw roomError(
        'room_id_taken',
        'That room id belongs to someone else. Re-key this tab with a fresh id and try again.',
        HttpStatus.CONFLICT,
      )
    }
    if (room.deletedAt !== null) {
      throw roomError(
        'room_id_taken',
        'That room id belongs to a deleted room. Re-key this tab with a fresh id and try again.',
        HttpStatus.CONFLICT,
      )
    }
    return room
  }

  private async insertMembershipIfAbsent (
    userId: string,
    roomId: string,
    role: RoomRole,
  ): Promise<void> {
    try {
      await this.memberships.create({
        userId,
        roomId,
        role,
        order: await this.nextOrder(userId),
        joinedAt: this.clock.now(),
      })
    } catch (error) {
      if (!isDuplicateKey(error)) throw error
    }
  }

  private async nextOrder (userId: string): Promise<number> {
    const last = await this.memberships.findOne({ userId }).sort({ order: -1 }).lean()
    return last ? last.order + 1 : 0
  }

  private async assignSlugAndShare (room: Room, requestedSlug?: string): Promise<void> {
    for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
      const slug = requestedSlug ?? room.slug ?? generateSlug()
      try {
        // The unique partial index is the arbiter; a check-then-write would race.
        await this.rooms.updateOne({ roomId: room.roomId }, { $set: { shared: true, slug } })
        return
      } catch (error) {
        if (!isDuplicateKey(error)) throw error
        if (requestedSlug ?? room.slug) {
          throw roomError('slug_taken', 'That invite link is already taken.', HttpStatus.CONFLICT)
        }
      }
    }

    throw roomError(
      'slug_taken',
      'Could not allocate an invite link, please try again.',
      HttpStatus.SERVICE_UNAVAILABLE,
    )
  }

  private assertVisitorToken (room: Room, visitorToken?: string): void {
    const payload = visitorToken ? this.verifyVisitorToken(visitorToken) : null
    if (!payload || payload.roomId !== room.roomId) {
      throw roomError(
        'password_required',
        'This room needs its invite password.',
        HttpStatus.UNAUTHORIZED,
      )
    }
    if (payload.passwordVersion !== room.passwordVersion) {
      throw roomError(
        'password_required',
        'The invite password changed. Enter the new one.',
        HttpStatus.UNAUTHORIZED,
      )
    }
  }

  private async assertRoomCapacity (userId: string): Promise<void> {
    const owned = await this.rooms.countDocuments({ createdBy: userId, deletedAt: null })
    if (owned >= CAPS.ownedRoomsPerUser) {
      throw roomError(
        'too_many_rooms',
        `You can own at most ${CAPS.ownedRoomsPerUser} synced tabs.`,
        HttpStatus.BAD_REQUEST,
      )
    }
  }

  private async assertMembershipCapacity (userId: string): Promise<void> {
    const held = await this.memberships.countDocuments({ userId })
    if (held >= CAPS.membershipsPerUser) {
      throw roomError(
        'too_many_memberships',
        `You can hold at most ${CAPS.membershipsPerUser} synced tabs.`,
        HttpStatus.BAD_REQUEST,
      )
    }
  }

  /** The tail every owner-only meta mutation shares: fan out, log, re-read. */
  private async finishMetaMutation (
    userId: string,
    roomId: string,
    kind: RoomActivityKind,
  ): Promise<RoomListEntry> {
    const affected = await this.memberIds(roomId)
    await this.steps.run('bump-rooms-revision', () => this.bumpRoomsRevision(affected))
    await this.steps.run('record-activity', () => this.activity.record(roomId, userId, kind))

    this.events.emit('room_meta', { roomId })
    this.events.emit('rooms_changed', { userIds: affected })

    return this.entryFor(userId, roomId)
  }

  private async entryFor (userId: string, roomId: string): Promise<RoomListEntry> {
    const room = await this.requireRoom(roomId)
    const membership = await this.memberships.findOne({ userId, roomId }).lean()
    return toListEntry(room, membership?.role ?? 'member', membership?.order ?? 0)
  }
}

export const toRoomMeta = (room: Room): RoomMeta => ({
  name: room.name,
  slug: room.slug,
  shared: room.shared,
  hasPassword: room.passwordHash !== null,
})

export const toListEntry = (room: Room, role: RoomRole, order: number): RoomListEntry => ({
  roomId: room.roomId,
  ...toRoomMeta(room),
  revision: room.revision,
  role,
  order,
})
