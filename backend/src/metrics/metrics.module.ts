import { Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { MetricsController } from './metrics.controller'
import { MetricsService } from './metrics.service'
import { MetricsTokenGuard } from './metrics-token.guard'
import { RealtimeModule } from '../realtime/realtime.module'
import { RoomsModule } from '../rooms/rooms.module'
import { TelemetryController } from './telemetry.controller'
import { TelemetryService } from './telemetry.service'

/**
 * Observability, reading everything and owning nothing. `/telemetry` lives here rather
 * than in a module of its own because the census it collects exists only to be scraped —
 * it is stored nowhere else and nothing else reads it.
 *
 * Imports for the models and the socket count: rooms and memberships plus the clock from
 * RoomsModule, users from AuthModule, the live connection index from RealtimeModule.
 */
@Module({
  imports: [RoomsModule, AuthModule, RealtimeModule],
  controllers: [MetricsController, TelemetryController],
  providers: [MetricsService, TelemetryService, MetricsTokenGuard],
})
export class MetricsModule {}
