import { Module } from '@nestjs/common'

import { ConnectionRegistry } from './connection-registry'
import { FieldLockService } from './field-lock.service'
import { RoomAccessService } from './room-access.service'
import { RoomGateway } from './room.gateway'
import { RoomOpService } from './room-op.service'
import { RoomsModule } from '../rooms/rooms.module'

/** The WS half of the rooms domain: it reads the same models and bus, never REST. */
@Module({
  imports: [RoomsModule],
  providers: [RoomGateway, ConnectionRegistry, FieldLockService, RoomAccessService, RoomOpService],
  exports: [ConnectionRegistry],
})
export class RealtimeModule {}
