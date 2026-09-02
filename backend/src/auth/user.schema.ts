import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import type { HydratedDocument } from 'mongoose'

/** Collection names are pinned explicitly: these documents predate this rewrite. */
@Schema({ collection: 'users' })
export class User {
  @Prop({ type: String, unique: true, required: true })
  username!: string

  @Prop({ type: String, required: true })
  password!: string

  @Prop({ type: Date, default: Date.now })
  registered!: Date

  /** Bumped by every room meta mutation this user is affected by; drives `rooms_changed`. */
  @Prop({ type: Number, default: 0 })
  roomsRevision!: number

  /** Set once, by the legacy blob import. Its presence is what makes the import idempotent. */
  @Prop({ type: String, default: null })
  legacyImportRoomId!: string | null

  /**
   * When this account last had an edit accepted. Written with `$max`, never `$set`: ops are
   * queued per room, not per account, so one person editing two rooms has no global ordering
   * and a plain set would let an older timestamp overwrite a newer one.
   *
   * Null means "never seen editing", which after the boot backfill also covers anyone whose
   * only activity predates what `room_activity` still holds.
   */
  @Prop({ type: Date, default: null })
  lastActiveAt!: Date | null

  /**
   * Accepted edits by this account, for ranking who is busiest and nothing else.
   *
   * **Approximate on purpose.** The increment happens after the edit commits and is allowed
   * to fail, because no metric may cost somebody their edit. `$inc` itself is atomic, so
   * nothing is lost to concurrency; what is lost is the occasional write that never ran.
   * When an exact number is wanted, sum `Room.revision` instead.
   */
  @Prop({ type: Number, default: 0 })
  editCount!: number
}

export type UserDocument = HydratedDocument<User>
export const UserSchema = SchemaFactory.createForClass(User)

// Every sf_active_accounts window is a range scan on this.
UserSchema.index({ lastActiveAt: -1 })
