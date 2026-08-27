import { CAPS } from 'common'
import { Inject, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import type { ClientOpMessage, Factory, RoomDiff } from 'common'

import { APPLIED_OPS_RING, Room } from '../rooms/schemas/room.schema'
import { CLOCK, Clock } from '../rooms/clock'
import { RoomAccessRole } from './room-access.service'
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

/** Resolves the sender's role against the room as just read; null means no access. */
export type OpAuthorizer = (room: Room) => Promise<RoomAccessRole | null>

@Injectable()
export class RoomOpService {
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
    const room = await this.rooms.findOne({ roomId: op.roomId }).lean()
    if (!room || room.deletedAt !== null) return { status: 'gone' }

    const role = await authorize(room)
    if (!role) return { status: 'forbidden' }

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
        { roomId: op.roomId, revision: op.baseRevision, deletedAt: null },
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
      // The guard lost, so someone moved the room between the read and the write.
      const fresh = await this.rooms.findOne({ roomId: op.roomId }).lean()
      return fresh && fresh.deletedAt === null ? { status: 'stale', room: fresh } : { status: 'gone' }
    }

    await this.activity.record(op.roomId, actor, 'op')

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

/** The post-merge factory list, or null when the diff does not touch factories. */
const mergedFactories = (room: Room, diff: RoomDiff): Factory[] | null =>
  diff.factories === undefined && diff.removedFactoryIds === undefined
    ? null
    : mergeFactories(room.factories, diff)

const contentUpdate = (diff: RoomDiff, factories: Factory[] | null): Record<string, unknown> => {
  const update: Record<string, unknown> = {}

  if (diff.name !== undefined) update.name = diff.name
  if (diff.powerTarget !== undefined) update.powerTarget = diff.powerTarget
  if (diff.groups !== undefined) update.groups = diff.groups
  if (factories !== null) update.factories = factories

  return update
}
