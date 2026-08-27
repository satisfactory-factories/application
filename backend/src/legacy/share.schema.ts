import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import type { HydratedDocument } from 'mongoose'

/**
 * Snapshot links. New ones are still created (the plan keeps "Copy snapshot
 * link"); existing rows are only ever read and view-counted, never rewritten.
 */
@Schema({ collection: 'shares' })
export class Share {
  @Prop({ type: String, unique: true, required: true })
  id!: string

  @Prop({ type: String, required: true })
  data!: string

  @Prop({ type: String, required: true })
  createdBy!: string

  @Prop({ type: Date, default: Date.now })
  created!: Date

  @Prop({ type: Number, default: 0 })
  views!: number

  /** Feeds the purge of old shares, so the collection cannot grow forever. */
  @Prop({ type: Date, default: Date.now })
  lastViewed!: Date
}

export type ShareDocument = HydratedDocument<Share>
export const ShareSchema = SchemaFactory.createForClass(Share)
