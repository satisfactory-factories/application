import { CAPS } from 'common'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import type { ClientOpMessage, Factory, RoomDiff } from 'common'

import { APPLIED_OPS_RING, Room } from '../rooms/schemas/room.schema'
import { CLOCK, Clock } from '../rooms/clock'
import { RoomAccess, RoomAccessRole } from './room-access.service'
import { RoomActivityService } from '../rooms/room-activity.service'
import { mergeFactories } from './room-snapshot'

export type OpOutcome =
  | { status: 'applied', revision: number }
  /** The op id is already in the ring: replay its original ack, change nothing. */
  | { status: 'duplicate', revision: number }
  | { status: 'stale', room: Room }
  /** Renaming is an owner right, so a member's op carrying `name` is refused whole. */
  | { status: 'not_owner', room: Room }
  /** The merged room would exceed the factories-per-room cap. */
  | { status: 'too_large', room: Room }
  | { status: 'forbidden' }
  | { status: 'gone' }

/** One consistent read: the sender's access and the room copy it is valid for. */
export type OpAuthorizer = () => Promise<RoomAccess>

@Injectable()
export class RoomOpService {
  private readonly logger = new Logger(RoomOpService.name)
  /** One in-flight apply per room, in arrival order. */
  private readonly queues = new Map<string, Promise<void>>()

  constructor (
    @InjectModel(Room.name) private readonly rooms: Model<Room>,
    private readonly activity: RoomActivityService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  apply (op: ClientOpMessage, actor: string, authorize: OpAuthorizer): Promise<OpOutcome> {
    return this.enqueue(op.roomId, () => this.applyNow(op, actor, authorize))
  }

  private async applyNow (
    op: ClientOpMessage,
    actor: string,
    authorize: OpAuthorizer,
  ): Promise<OpOutcome> {
    // The room the op is judged against is the one authorization was computed
    // against; reading it here separately is the window this closes.
    const access = await authorize()
    if (access.status !== 'granted') return refuse(access)
    const { role, room } = access

    // Dedup precedes the revision check: a retried op has a stale base by definition.
    const replayed = room.appliedOps.find(entry => entry.opId === op.opId)
    if (replayed) return { status: 'duplicate', revision: replayed.revision }

    if (room.revision !== op.baseRevision) return { status: 'stale', room }

    // Members and visitors write content only; the room's name is the owner's.
    if (op.diff.name !== undefined && role !== 'owner') return { status: 'not_owner', room }

    const factories = mergedFactories(room, op.diff)
    if (factories && factories.length > CAPS.factoriesPerRoom) return { status: 'too_large', room }

    const revision = op.baseRevision + 1
    const updated = await this.rooms
      .findOneAndUpdate(
        { roomId: op.roomId, revision: op.baseRevision, deletedAt: null, ...accessGuard(role, room) },
        {
          $set: { ...contentUpdate(op.diff, factories), lastActivityAt: this.clock.now() },
          $inc: { revision: 1 },
          $push: {
            appliedOps: { $each: [{ opId: op.opId, revision }], $slice: -APPLIED_OPS_RING },
          },
        },
        { returnDocument: 'after' },
      )
      .lean()

    if (!updated) {
      // The guard covers access as well as the revision, so a miss is re-authorized
      // rather than assumed stale: the snapshot a `stale` carries must not answer a
      // sender whose access went away between the check and the write.
      const fresh = await authorize()
      if (fresh.status !== 'granted') return refuse(fresh)
      return { status: 'stale', room: fresh.room }
    }

    // Past this line the content is committed, so nothing may deny the sender its
    // ack or the peers their broadcast: a wedged client is worse than a lost row.
    try {
      await this.activity.record(op.roomId, actor, 'op')
    } catch (cause) {
      this.logger.error(`Failed to record op activity for room ${op.roomId}`, cause)
    }

    return { status: 'applied', revision: updated.revision }
  }

  private enqueue<T> (roomId: string, work: () => Promise<T>): Promise<T> {
    const tail = this.queues.get(roomId) ?? Promise.resolve()
    const result = tail.then(work)
    const settled = result.then(() => undefined, () => undefined)

    this.queues.set(roomId, settled)
    void settled.then(() => {
      if (this.queues.get(roomId) === settled) this.queues.delete(roomId)
    })

    return result
  }
}

/** A refused read, as an outcome. A room nobody may read is `gone` either way. */
const refuse = (access: Exclude<RoomAccess, { status: 'granted' }>): OpOutcome =>
  access.status === 'missing' || access.status === 'deleted'
    ? { status: 'gone' }
    : { status: 'forbidden' }

/**
 * The room must still be in the state the sender's role was computed from. Unshare
 * bumps `membershipEpoch` and a password change bumps `passwordVersion`, and
 * neither touches `revision` — so the revision guard alone lets a just-revoked
 * op commit. Owners are exempt: they never lose their own room, and their own
 * share or rotation would otherwise refuse the op they had in flight.
 */
const accessGuard = (role: RoomAccessRole, room: Room): Record<string, unknown> => {
  if (role === 'owner') return {}
  // Spelled `?? null` because Mongo matches an absent field against null, never 0.
  const guard: Record<string, unknown> = { membershipEpoch: room.membershipEpoch ?? null }
  if (role === 'visitor') guard.passwordVersion = room.passwordVersion ?? null
  return guard
}

/** The post-merge factory list, or null when the diff does not touch factories. */
const mergedFactories = (room: Room, diff: RoomDiff): Factory[] | null =>
  diff.factories === undefined && diff.removedFactoryIds === undefined
    ? null
    : mergeFactories(room.factories, diff)

const contentUpdate = (diff: RoomDiff, factories: Factory[] | null): Record<string, unknown> => {
  const update: Record<string, unknown> = {}

  if (diff.name !== undefined) update.name = diff.name
  if (diff.powerTarget !== undefined) update.powerTarget = diff.powerTarget
  if (diff.depotUploadTier !== undefined) update.depotUploadTier = diff.depotUploadTier
  if (diff.depotExpansionTier !== undefined) update.depotExpansionTier = diff.depotExpansionTier
  if (diff.plannerVersion !== undefined) update.plannerVersion = diff.plannerVersion
  if (diff.groups !== undefined) update.groups = diff.groups
  if (factories !== null) update.factories = factories

  return update
}
