import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import type { Model } from 'mongoose'

import { EventCountersService } from '../event-counters/event-counters.service'
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
@Injectable()
export class RoomTotalsService {
  private readonly logger = new Logger(RoomTotalsService.name)

  constructor (
    @InjectModel(RoomTotal.name) private readonly totals: Model<RoomTotal>,
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

  async all (): Promise<Map<string, number>> {
    const rows = await this.totals.find({}, { kind: 1, value: 1 }).lean()
    return new Map(rows.map(row => [row.kind, row.value]))
  }
}
