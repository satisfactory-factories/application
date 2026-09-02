import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { TELEMETRY_CAPS } from 'common'
import type { HydratedDocument } from 'mongoose'

/**
 * One row per browser that has checked in recently.
 *
 * This started in memory, on the reasoning that a heartbeat is worthless fifteen minutes
 * after it arrives and that one write per browser per five minutes would be the busiest
 * collection in the database. The first half is true and the second was overstated: a
 * hundred concurrent browsers is twenty writes a minute, which is nothing. What the
 * in-memory version actually cost was the whole census on every deploy, and the API
 * redeploys often enough for that to be the thing people noticed.
 *
 * **Nothing identifying is stored.** `instanceId` is the random UUID the browser minted for
 * itself, and the rest are counts, a flag and two build strings. See `docs/telemetry.md`.
 */
@Schema({ collection: 'telemetry_instances' })
export class TelemetryInstance {
  /** The browser's own random UUID. Never derived from, or joined to, an account. */
  @Prop({ type: String, required: true, unique: true })
  instanceId!: string

  @Prop({ type: Date, required: true })
  lastSeenAt!: Date

  @Prop({ type: Boolean, default: false })
  signedIn!: boolean

  @Prop({ type: Number, default: 0 })
  localTabs!: number

  @Prop({ type: Number, default: 0 })
  cloudTabs!: number

  @Prop({ type: Number, default: 0 })
  factories!: number

  @Prop({ type: String, default: '' })
  version!: string

  @Prop({ type: String, default: '' })
  sha!: string
}

export type TelemetryInstanceDocument = HydratedDocument<TelemetryInstance>
export const TelemetryInstanceSchema = SchemaFactory.createForClass(TelemetryInstance)

/**
 * Mongo sweeps expired documents about once a minute, so this bounds storage but does not
 * define the window. Every read still filters on `lastSeenAt` explicitly, which is what makes
 * "active in the last fifteen minutes" exact rather than "within a minute of it".
 */
TelemetryInstanceSchema.index(
  { lastSeenAt: 1 },
  { expireAfterSeconds: Math.round(TELEMETRY_CAPS.activeWindowMs / 1000) },
)
