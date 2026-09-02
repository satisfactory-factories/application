import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { AuthModule } from '../auth/auth.module'
import { CLOCK, systemClock } from './clock'
import { EnsureStepRunner } from './ensure-step.runner'
import { LegacyImportService } from './legacy-import.service'
import { LegacyModule } from '../legacy/legacy.module'
import { Room, RoomSchema } from './schemas/room.schema'
import { RoomActivity, RoomActivitySchema } from './schemas/room-activity.schema'
import { RoomActivityService } from './room-activity.service'
import { RoomEventsService } from './room-events.service'
import { RoomMembership, RoomMembershipSchema } from './schemas/room-membership.schema'
import { RoomSweeperService } from './room-sweeper.service'
import { RoomsController } from './rooms.controller'
import { RoomsService } from './rooms.service'
import { UserActivityModule } from '../user-activity/user-activity.module'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Room.name, schema: RoomSchema },
      { name: RoomMembership.name, schema: RoomMembershipSchema },
      { name: RoomActivity.name, schema: RoomActivitySchema },
    ]),
    AuthModule, // The User model, for roomsRevision and the legacy import stamp.
    UserActivityModule, // Re-exported so the WS gateway can stamp an editor.
    LegacyModule, // The read-only FactoryData blob.
  ],
  controllers: [RoomsController],
  providers: [
    RoomsService,
    RoomActivityService,
    RoomEventsService,
    RoomSweeperService,
    LegacyImportService,
    EnsureStepRunner,
    { provide: CLOCK, useValue: systemClock },
  ],
  // Exported for the WS gateway, which reads rooms and listens for fan-out, and for the
  // metrics module. UserActivityService lives here rather than in metrics/ so that
  // RealtimeModule can reach it without the two modules importing each other.
  exports: [
    RoomsService,
    RoomActivityService,
    RoomEventsService,
    UserActivityModule,
    MongooseModule,
    CLOCK,
  ],
})
export class RoomsModule {}
