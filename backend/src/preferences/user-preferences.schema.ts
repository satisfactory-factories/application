import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Schema as MongooseSchema } from 'mongoose'
import type { HydratedDocument } from 'mongoose'
import type { SyncedPreferences } from 'common'

/** `minimize: false` so clearing every key stores `{}` rather than dropping the field. */
@Schema({ collection: 'user_preferences', minimize: false })
export class UserPreferences {
  @Prop({ type: String, required: true, unique: true })
  userId!: string

  @Prop({ type: MongooseSchema.Types.Mixed, default: () => ({}) })
  prefs!: SyncedPreferences

  @Prop({ type: Number, default: 0 })
  revision!: number
}

export type UserPreferencesDocument = HydratedDocument<UserPreferences>
export const UserPreferencesSchema = SchemaFactory.createForClass(UserPreferences)
