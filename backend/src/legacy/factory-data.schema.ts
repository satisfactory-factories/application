import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Schema as MongooseSchema } from 'mongoose'
import type { HydratedDocument } from 'mongoose'

/**
 * The pre-v7 one-blob-per-account save, keyed by username. Read-only: nothing
 * writes it any more, and adoption reads it to seed a room.
 */
@Schema({ collection: 'factorydatas', minimize: false })
export class FactoryData {
  @Prop({ type: String, required: true })
  user!: string

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  data!: unknown

  @Prop({ type: Date, default: Date.now })
  lastSaved!: Date
}

export type FactoryDataDocument = HydratedDocument<FactoryData>
export const FactoryDataSchema = SchemaFactory.createForClass(FactoryData)
