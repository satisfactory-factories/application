import { Inject, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'

import { CLOCK, Clock } from './clock'
import { RoomActivity, RoomActivityKind } from './schemas/room-activity.schema'
import { RoomTotalsService } from '../room-totals/room-totals.service'

/** The actor recorded for an anonymous visitor's write. */
export const ANONYMOUS_ACTOR = 'anon'

@Injectable()
export class RoomActivityService {
  constructor (
    @InjectModel(RoomActivity.name) private readonly activity: Model<RoomActivity>,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly totals: RoomTotalsService,
  ) {}

  /**
   * Ops are excluded. One fires per accepted edit, which is the hottest write path in the
   * service, and `sf_room_revisions` already sums them from the room documents for free.
   */
  private async tally (kind: RoomActivityKind): Promise<void> {
    if (kind !== 'op') await this.totals.bump(kind)
  }

  // Append-only, so it is the last step of every chain: a resumed mutation then
  // writes exactly one row rather than a duplicate.
  async record (
    roomId: string,
    actor: string,
    kind: RoomActivityKind,
    summary?: string,
    options: { tally?: boolean } = {},
  ): Promise<void> {
    await this.activity.create({ roomId, actor, kind, summary, at: this.clock.now() })
    if (options.tally !== false) await this.tally(kind)
  }

  /**
   * For the kinds that can only happen once in a room's life (creation, deletion).
   * An upsert keeps a resumed chain from logging the same event twice.
   */
  async recordOnce (roomId: string, actor: string, kind: RoomActivityKind): Promise<void> {
    const { upsertedCount } = await this.activity.updateOne(
      { roomId, kind },
      { $setOnInsert: { roomId, kind, actor, at: this.clock.now() } },
      { upsert: true },
    )

    // Only when the row was actually inserted. A resumed chain calls this again and the
    // upsert matches instead, which must not count the same creation a second time.
    if (upsertedCount > 0) await this.tally(kind)
  }
}
