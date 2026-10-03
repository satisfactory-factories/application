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

  /**
   * The account's token generation. Every JWT carries the value it was minted at, and a
   * password change bumps this, so every token issued before it stops being accepted.
   *
   * Absent on documents written before this field existed, which reads as 0 and matches a
   * token carrying no claim: the deploy logs nobody out, and the first password change
   * after it starts the versioning for that account.
   */
  @Prop({ type: Number, default: 0 })
  tokenVersion!: number

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

  /**
   * When this account last signed in. Separate from `lastActiveAt`, which is about editing:
   * somebody can sign in, read their plan and change nothing, and that is a different fact.
   *
   * `$max` for the same reason as `lastActiveAt`: two devices signing in at once have no
   * ordering, and a plain set would let the earlier one land last.
   */
  @Prop({ type: Date, default: null })
  lastSignInAt!: Date | null

  /** Sign-ins by this account. Approximate for the same reason as {@link editCount}. */
  @Prop({ type: Number, default: 0 })
  signInCount!: number
}

export type UserDocument = HydratedDocument<User>
export const UserSchema = SchemaFactory.createForClass(User)

// Every rolling-window count is a range scan on one of these.
UserSchema.index({ lastActiveAt: -1 })
UserSchema.index({ lastSignInAt: -1 })
UserSchema.index({ registered: -1 })
