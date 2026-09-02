import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import type { HydratedDocument } from 'mongoose'

/**
 * One row per room activity kind, holding how many have ever happened.
 *
 * This exists because `room_activity` cannot answer that question, despite recording every
 * one of these events. The sweeper trims it to 200 rows per room and deletes a room's rows
 * outright when the room is purged, so counting rows there undercounts, and does so more
 * the longer the service runs. A tally that is only ever incremented has neither problem.
 */
@Schema({ collection: 'room_totals' })
export class RoomTotal {
  /** A `RoomActivityKind`. Not typed as the enum: an old row must survive a kind being renamed. */
  @Prop({ type: String, required: true, unique: true })
  kind!: string

  @Prop({ type: Number, default: 0 })
  value!: number
}

export type RoomTotalDocument = HydratedDocument<RoomTotal>
export const RoomTotalSchema = SchemaFactory.createForClass(RoomTotal)
