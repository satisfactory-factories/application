import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import type { RoomRole } from 'common'
import type { HydratedDocument } from 'mongoose'

/**
 * Access and tab-bar position, never plan data. The room document is the only
 * copy of a synced tab's content, so there is nothing here to fall out of sync.
 */
@Schema({ collection: 'room_memberships' })
export class RoomMembership {
  @Prop({ type: String, required: true })
  userId!: string

  @Prop({ type: String, required: true, index: true })
  roomId!: string

  @Prop({ type: String, required: true, enum: ['owner', 'member'] })
  role!: RoomRole

  @Prop({ type: Number, default: 0 })
  order!: number

  @Prop({ type: Date, default: Date.now })
  joinedAt!: Date
}

export type RoomMembershipDocument = HydratedDocument<RoomMembership>
export const RoomMembershipSchema = SchemaFactory.createForClass(RoomMembership)

// The ensure-membership step reads a duplicate key here as "already done".
RoomMembershipSchema.index({ userId: 1, roomId: 1 }, { unique: true })
