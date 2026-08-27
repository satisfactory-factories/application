import { Inject, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'

import { CLOCK, Clock } from './clock'
import { RoomActivity, RoomActivityKind } from './schemas/room-activity.schema'

/** The actor recorded for an anonymous visitor's write. */
export const ANONYMOUS_ACTOR = 'anon'

@Injectable()
export class RoomActivityService {
  constructor (
    @InjectModel(RoomActivity.name) private readonly activity: Model<RoomActivity>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // Append-only, so it is the last step of every chain: a resumed mutation then
  // writes exactly one row rather than a duplicate.
  async record (
    roomId: string,
    actor: string,
    kind: RoomActivityKind,
    summary?: string,
  ): Promise<void> {
    await this.activity.create({ roomId, actor, kind, summary, at: this.clock.now() })
  }

  /**
   * For the kinds that can only happen once in a room's life (creation, deletion).
   * An upsert keeps a resumed chain from logging the same event twice.
   */
  async recordOnce (roomId: string, actor: string, kind: RoomActivityKind): Promise<void> {
    await this.activity.updateOne(
      { roomId, kind },
      { $setOnInsert: { roomId, kind, actor, at: this.clock.now() } },
      { upsert: true },
    )
  }
}
