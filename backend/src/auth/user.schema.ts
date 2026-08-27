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
}

export type UserDocument = HydratedDocument<User>
export const UserSchema = SchemaFactory.createForClass(User)
