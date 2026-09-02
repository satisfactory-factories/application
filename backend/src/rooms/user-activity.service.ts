import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import type { Model } from 'mongoose'

import { RoomActivity } from './schemas/room-activity.schema'
import { User } from '../auth/user.schema'

/** `room_activity` records this for a write with no account behind it. */
export const ANONYMOUS_ACTOR = 'anon'

/**
 * Stamps an account as having edited, so the metrics module can answer "how many accounts were
 * active in the last hour / day / week" from a timestamp rather than a bucket.
 *
 * Deliberately tiny, and deliberately not a general activity log — `room_activity` already is
 * one, but the sweeper trims it to 200 rows per room, so it cannot answer anything older than
 * the busiest plans' recent history.
 *
 * Lives under `rooms/` rather than `metrics/` only to keep the module graph acyclic:
 * MetricsModule already imports RealtimeModule for the socket count, so RealtimeModule
 * cannot import MetricsModule back. Both import RoomsModule.
 */
@Injectable()
export class UserActivityService {
  private readonly logger = new Logger(UserActivityService.name)

  constructor (
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(RoomActivity.name) private readonly activity: Model<RoomActivity>,
  ) {}

  /**
   * One update, two fields. `$max` on the date because ops are queued per room and not per
   * account: the same person editing two rooms at once has no global ordering, so a `$set`
   * would let the earlier op's write land last and move the timestamp backwards.
   *
   * Anonymous visitors have no account to stamp.
   */
  async recordEdit (userId: string, at: Date): Promise<void> {
    if (userId === ANONYMOUS_ACTOR) return

    await this.users.updateOne(
      { _id: userId },
      { $max: { lastActiveAt: at }, $inc: { editCount: 1 } },
    )
  }

  /**
   * Seeds `lastActiveAt` from whatever `room_activity` still holds, so the windows are not
   * blank for a month after release.
   *
   * **Only `kind: 'op'` counts.** The collection also holds `created`, `joined`, `renamed` and
   * `deleted`, and treating those as edits would contradict what the metric claims to measure:
   * somebody who joined a shared plan and never touched it is not an active editor.
   *
   * Needs no marker and no lock: it writes with the same `$max`, so running it twice, or on two
   * boots at once, cannot lower a value or double anything. A partial bootstrap rather than a
   * reconstruction — the activity log is trimmed per room and dropped with deleted rooms.
   */
  async backfillLastActive (): Promise<number> {
    const newest = await this.activity.aggregate<{ _id: string, at: Date }>([
      { $match: { kind: 'op', actor: { $ne: ANONYMOUS_ACTOR } } },
      { $group: { _id: '$actor', at: { $max: '$at' } } },
    ])

    if (newest.length === 0) return 0

    const writes = newest.map(({ _id, at }) => ({
      updateOne: { filter: { _id }, update: { $max: { lastActiveAt: at } } },
    }))

    // Unordered: one unmatched id (an account deleted since) must not stop the rest.
    const result = await this.users.bulkWrite(writes, { ordered: false })
    return result.modifiedCount ?? 0
  }

  /** Logged rather than thrown: a blank window is worth less than a failed boot. */
  async backfillSafely (): Promise<void> {
    try {
      const stamped = await this.backfillLastActive()
      if (stamped > 0) this.logger.log(`Backfilled lastActiveAt for ${stamped} account(s)`)
    } catch (cause) {
      this.logger.error('Failed to backfill lastActiveAt', cause)
    }
  }
}
