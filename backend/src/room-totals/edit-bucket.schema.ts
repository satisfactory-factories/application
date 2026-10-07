import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import type { HydratedDocument } from 'mongoose'

/** How long a bucket is kept: the widest window the metrics report, plus a margin. */
export const EDIT_BUCKET_TTL_SECONDS = 31 * 24 * 60 * 60

/**
 * Accepted edits per room or per account, per clock hour. Answers "busiest in the last
 * 24 hours" exactly to the hour, which neither the running totals nor the trimmed
 * activity log can.
 */
@Schema({ collection: 'edit_buckets' })
export class EditBucket {
  @Prop({ type: String, required: true, enum: ['room', 'user'] })
  scope!: 'room' | 'user'

  /** A room id or a user id. */
  @Prop({ type: String, required: true })
  key!: string

  /** The start of the hour. */
  @Prop({ type: Date, required: true })
  hour!: Date

  @Prop({ type: Number, default: 0 })
  count!: number
}

export type EditBucketDocument = HydratedDocument<EditBucket>
export const EditBucketSchema = SchemaFactory.createForClass(EditBucket)

EditBucketSchema.index({ scope: 1, key: 1, hour: 1 }, { unique: true })
EditBucketSchema.index({ hour: 1 }, { expireAfterSeconds: EDIT_BUCKET_TTL_SECONDS })
