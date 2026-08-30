import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Schema as MongooseSchema } from 'mongoose'
import type { Factory, FactoryGroup } from 'common'
import type { HydratedDocument } from 'mongoose'

/** How many recent op ids a room remembers, so a retried op replays its ack. */
export const APPLIED_OPS_RING = 50

@Schema({ _id: false })
export class AppliedOp {
  @Prop({ type: String, required: true })
  opId!: string

  @Prop({ type: Number, required: true })
  revision!: number
}

export const AppliedOpSchema = SchemaFactory.createForClass(AppliedOp)

/**
 * The authoritative copy of a synced tab. `minimize: false` because a factory's
 * empty maps (`syncState`, `rawResources`) are meaningful and mongoose would
 * otherwise drop them, which changes the shape the client gets back.
 */
@Schema({ collection: 'rooms', minimize: false, timestamps: true })
export class Room {
  /** The tab's own UUID, chosen by the client so a tab's identity never changes. */
  @Prop({ type: String, required: true, unique: true })
  roomId!: string

  /** The invite link's three-word name. Null until the room is shared. */
  @Prop({ type: String, default: null })
  slug!: string | null

  @Prop({ type: String, required: true })
  name!: string

  @Prop({ type: Boolean, default: false })
  shared!: boolean

  /** Set once, by the tombstone step of delete. Non-null means inert. */
  @Prop({ type: Date, default: null })
  deletedAt!: Date | null

  @Prop({ type: String, default: null })
  passwordHash!: string | null

  /** Bumped by every password change; a visitor token below the current value is dead. */
  @Prop({ type: Number, default: 0 })
  passwordVersion!: number

  /**
   * Bumped by unshare's first write, which is what makes revocation complete before
   * any cleanup runs: a non-owner membership granted below this is void.
   */
  @Prop({ type: Number, default: 0 })
  membershipEpoch!: number

  @Prop({ type: MongooseSchema.Types.Mixed, default: () => [] })
  factories!: Factory[]

  @Prop({ type: Number, default: 0 })
  powerTarget!: number

  // No defaults: absent is a meaning here, not a gap. The depot tiers read as fully
  // researched when unset, and an unset `plannerVersion` means the plan has not been
  // answered for — writing a value in would answer it on the user's behalf.
  @Prop({ type: Number })
  depotUploadTier?: number

  @Prop({ type: Number })
  depotExpansionTier?: number

  @Prop({ type: String })
  plannerVersion?: string

  @Prop({ type: MongooseSchema.Types.Mixed, default: () => [] })
  groups!: FactoryGroup[]

  @Prop({ type: Number, default: 0 })
  revision!: number

  @Prop({ type: [AppliedOpSchema], default: () => [] })
  appliedOps!: AppliedOp[]

  @Prop({ type: String, required: true })
  createdBy!: string

  @Prop({ type: Date, default: Date.now })
  lastActivityAt!: Date

  createdAt!: Date
  updatedAt!: Date
}

export type RoomDocument = HydratedDocument<Room>
export const RoomSchema = SchemaFactory.createForClass(Room)

// Partial rather than sparse: an unshared room stores `slug: null`, and a sparse
// index still indexes nulls, so every second private room would collide.
RoomSchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: { slug: { $type: 'string' } } },
)
RoomSchema.index({ createdBy: 1, deletedAt: 1 })
RoomSchema.index({ deletedAt: 1 })
