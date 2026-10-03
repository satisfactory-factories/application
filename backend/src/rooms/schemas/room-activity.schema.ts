import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import type { HydratedDocument } from 'mongoose'

export const ROOM_ACTIVITY_KINDS = [
  'created',
  'adopted',
  'imported',
  'renamed',
  'shared',
  'unshared',
  'password_set',
  'password_removed',
  'joined',
  'left',
  'deleted',
  'op',
] as const

export type RoomActivityKind = typeof ROOM_ACTIVITY_KINDS[number]

/** Recorded from day one, rendered by nobody until the history UI lands. */
@Schema({ collection: 'room_activity' })
export class RoomActivity {
  @Prop({ type: String, required: true })
  roomId!: string

  @Prop({ type: Date, required: true })
  at!: Date

  /** A user id, or 'anon' for an anonymous visitor. */
  @Prop({ type: String, required: true })
  actor!: string

  @Prop({ type: String, required: true, enum: ROOM_ACTIVITY_KINDS })
  kind!: RoomActivityKind

  @Prop({ type: String })
  summary?: string
}

export type RoomActivityDocument = HydratedDocument<RoomActivity>
export const RoomActivitySchema = SchemaFactory.createForClass(RoomActivity)

RoomActivitySchema.index({ roomId: 1, at: -1 })
