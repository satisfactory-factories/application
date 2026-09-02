import { Inject, Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'

import { CLOCK, Clock } from './clock'
import { Room } from './schemas/room.schema'
import { RoomActivity } from './schemas/room-activity.schema'
import { RoomMembership } from './schemas/room-membership.schema'
import { EventCountersService } from '../event-counters/event-counters.service'

export const SWEEP_INTERVAL_MS = 60 * 60 * 1000
/** An adoption resumes at the next login, well inside this. */
export const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000
export const ACTIVITY_PER_ROOM = 200

export interface SweepSummary {
  tombstonedRooms: number
  orphanRooms: number
  activityTrimmed: number
}

@Injectable()
export class RoomSweeperService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout

  constructor (
    @InjectModel(Room.name) private readonly rooms: Model<Room>,
    @InjectModel(RoomMembership.name) private readonly memberships: Model<RoomMembership>,
    @InjectModel(RoomActivity.name) private readonly activity: Model<RoomActivity>,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly counters: EventCountersService,) {}

  onApplicationBootstrap (): void {
    this.timer = setInterval(() => void this.sweepSafely(), SWEEP_INTERVAL_MS)
    this.timer.unref() // Never the reason the process refuses to exit.
  }

  onModuleDestroy (): void {
    if (this.timer) clearInterval(this.timer)
  }

  async sweepSafely (): Promise<void> {
    try {
      const summary = await this.sweep()
      console.log('Room sweep:', summary)
    } catch (error) {
      console.error('Room sweep failed:', error)
      this.counters.record('server', 'room_sweep_failed')
    }
  }

  async sweep (): Promise<SweepSummary> {
    return {
      tombstonedRooms: await this.purgeTombstoned(),
      orphanRooms: await this.purgeOrphans(),
      activityTrimmed: await this.trimActivity(),
    }
  }

  /** Tombstoned rooms go regardless of shared state: the tombstone already made them inert. */
  private async purgeTombstoned (): Promise<number> {
    const roomIds = (await this.rooms.find({ deletedAt: { $ne: null } }).lean())
      .map(room => room.roomId)

    return this.purge(roomIds)
  }

  /**
   * A room nobody is a member of and nobody can reach: either a create that never
   * got its membership, or the last member left a private room.
   */
  private async purgeOrphans (): Promise<number> {
    const cutoff = new Date(this.clock.now().getTime() - ORPHAN_GRACE_MS)
    const candidates = await this.rooms
      .find({ shared: false, deletedAt: null, createdAt: { $lte: cutoff } })
      .lean()
    if (candidates.length === 0) return 0

    const ids = candidates.map(room => room.roomId)
    const held = new Set((await this.memberships.find({ roomId: { $in: ids } }).lean())
      .map(membership => membership.roomId))

    return this.purge(ids.filter(roomId => !held.has(roomId)))
  }

  private async purge (roomIds: string[]): Promise<number> {
    if (roomIds.length === 0) return 0

    await this.memberships.deleteMany({ roomId: { $in: roomIds } })
    await this.activity.deleteMany({ roomId: { $in: roomIds } })
    const { deletedCount } = await this.rooms.deleteMany({ roomId: { $in: roomIds } })

    return deletedCount
  }

  private async trimActivity (): Promise<number> {
    const overflowing = await this.activity.aggregate<{ _id: string, count: number }>([
      { $group: { _id: '$roomId', count: { $sum: 1 } } },
      { $match: { count: { $gt: ACTIVITY_PER_ROOM } } },
    ])

    let trimmed = 0
    for (const { _id: roomId } of overflowing) {
      const [boundary] = await this.activity
        .find({ roomId })
        .sort({ at: -1, _id: -1 })
        .skip(ACTIVITY_PER_ROOM - 1)
        .limit(1)
        .lean()
      if (!boundary) continue

      // `_id` breaks ties so rows sharing a millisecond are not over-deleted.
      const { deletedCount } = await this.activity.deleteMany({
        roomId,
        $or: [
          { at: { $lt: boundary.at } },
          { at: boundary.at, _id: { $lt: boundary._id } },
        ],
      })
      trimmed += deletedCount
    }

    return trimmed
  }
}
