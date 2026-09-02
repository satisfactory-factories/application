import { Module, OnModuleInit } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { AuthModule } from '../auth/auth.module'
import { MetricsController } from './metrics.controller'
import { MetricsService } from './metrics.service'
import { MetricsTokenGuard } from './metrics-token.guard'
import { RealtimeModule } from '../realtime/realtime.module'
import { RoomsModule } from '../rooms/rooms.module'
import { TelemetryController } from './telemetry.controller'
import { TelemetryInstance, TelemetryInstanceSchema } from './telemetry-instance.schema'
import { TelemetryService } from './telemetry.service'
import { UserActivityModule } from '../user-activity/user-activity.module'
import { UserActivityService } from '../user-activity/user-activity.service'

/**
 * Observability, reading everything and owning nothing. `/telemetry` lives here rather
 * than in a module of its own because the census it collects exists only to be scraped —
 * it is stored nowhere else and nothing else reads it.
 *
 * Imports for the models and the socket count: rooms and memberships plus the clock from
 * RoomsModule, users from AuthModule, the live connection index from RealtimeModule.
 */
@Module({
  imports: [
    RoomsModule,
    AuthModule,
    RealtimeModule,
    UserActivityModule,
    MongooseModule.forFeature([
      { name: TelemetryInstance.name, schema: TelemetryInstanceSchema },
    ]),
  ],
  controllers: [MetricsController, TelemetryController],
  providers: [MetricsService, TelemetryService, MetricsTokenGuard],
})
export class MetricsModule implements OnModuleInit {
  constructor (private readonly userActivity: UserActivityService) {}

  /**
   * Seeds `lastActiveAt` from what the activity log still holds, so the account windows are
   * not blank for a month after release. Needs no marker: the backfill writes with `$max`,
   * so running it on every boot cannot lower a value or double anything.
   *
   * Not awaited. Boot must not block on it, and a failure is logged rather than thrown —
   * `/health` answering is worth more than a seeded gauge.
   */
  onModuleInit (): void {
    void this.userActivity.backfillSafely()
  }
}
