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
}

export type UserDocument = HydratedDocument<User>
export const UserSchema = SchemaFactory.createForClass(User)
