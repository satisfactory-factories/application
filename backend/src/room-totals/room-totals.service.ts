import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import type { Model } from 'mongoose'

import { EventCountersService } from '../event-counters/event-counters.service'
import { Room } from '../rooms/schemas/room.schema'
import { EditBucket } from './edit-bucket.schema'
import { RoomTotal } from './room-total.schema'
import type { RoomActivityKind } from '../rooms/schemas/room-activity.schema'

/**
 * The permanent count of room lifecycle events: how many rooms have ever been made, how
 * many invites have ever been accepted. See `room-total.schema.ts` for why the activity
 * log itself cannot answer this.
 *
 * In a module of its own for the same reason as UserActivityService: the writer lives in
 * RoomsModule and the reader in MetricsModule, and hanging it off either would put a cycle
 * in the graph.
 */
const HOUR_MS = 60 * 60 * 1000

@Injectable()
export class RoomTotalsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RoomTotalsService.name)

  constructor (
    @InjectModel(RoomTotal.name) private readonly totals: Model<RoomTotal>,
    @InjectModel(Room.name) private readonly rooms: Model<Room>,
    @InjectModel(EditBucket.name) private readonly buckets: Model<EditBucket>,
    private readonly counters: EventCountersService,
  ) {}

  /**
   * Never throws. By the time this is called the event it counts has already committed, so
   * failing the request would report a room that was made as one that was not. A lost bump
   * is a metric that reads one low forever, which is worth strictly less than the request.
   */
  async bump (kind: RoomActivityKind): Promise<void> {
    try {
      await this.totals.updateOne({ kind }, { $inc: { value: 1 } }, { upsert: true })
    } catch (cause) {
      this.logger.error(`Failed to count a "${kind}" room event`, cause)
      this.counters.record('server', 'post_commit_room_total_lost')
    }
  }

  /** Never throws, for the same reason as {@link bump}. Anonymous visitors have no account. */
  async bumpEditBuckets (roomId: string, actor: string, at: Date, anonymous: boolean): Promise<void> {
    const hour = new Date(Math.floor(at.getTime() / HOUR_MS) * HOUR_MS)
    const keys: Array<['room' | 'user', string]> = [['room', roomId]]
    if (!anonymous) keys.push(['user', actor])
    try {
      await this.buckets.bulkWrite(keys.map(([scope, key]) => ({
        updateOne: { filter: { scope, key, hour }, update: { $inc: { count: 1 } }, upsert: true },
      })), { ordered: false })
    } catch (cause) {
      this.logger.error('Failed to count an edit into its hourly bucket', cause)
      this.counters.record('server', 'post_commit_edit_bucket_lost')
    }
  }

  /** The busiest rooms or accounts since `since`, which is floored to the hour. */
  async busiestSince (scope: 'room' | 'user', since: Date, limit: number): Promise<Array<{ key: string, edits: number }>> {
    const hour = new Date(Math.floor(since.getTime() / HOUR_MS) * HOUR_MS)
    const rows = await this.buckets.aggregate<{ _id: string, edits: number }>([
      { $match: { scope, hour: { $gte: hour } } },
      { $group: { _id: '$key', edits: { $sum: '$count' } } },
      { $sort: { edits: -1, _id: 1 } },
      { $limit: limit },
    ])
    return rows.map(row => ({ key: row._id, edits: row.edits }))
  }

  /** Runs before the server listens, so no op can create the row first and skip the seed. */
  async onApplicationBootstrap (): Promise<void> {
    try {
      await this.seedEdits()
    } catch (cause) {
      this.logger.error('Failed to seed the edit tally', cause)
    }
  }

  /**
   * The edit tally started long after the first edit, so it begins at the edits still on
   * live plans. Edits on plans deleted before then are gone and cannot be recovered.
   * `$setOnInsert` makes this a no-op on every boot after the first.
   */
  async seedEdits (): Promise<void> {
    const [row] = await this.rooms.aggregate<{ revisions: number }>([
      { $match: { deletedAt: null } },
      { $group: { _id: null, revisions: { $sum: { $ifNull: ['$revision', 0] } } } },
    ])
    await this.totals.updateOne(
      { kind: 'op' },
      { $setOnInsert: { value: row?.revisions ?? 0 } },
      { upsert: true },
    )
  }

  async all (): Promise<Map<string, number>> {
    const rows = await this.totals.find({}, { kind: 1, value: 1 }).lean()
    return new Map(rows.map(row => [row.kind, row.value]))
  }
}
