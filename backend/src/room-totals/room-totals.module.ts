import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { Room, RoomSchema } from '../rooms/schemas/room.schema'
import { EditBucket, EditBucketSchema } from './edit-bucket.schema'
import { RoomTotal, RoomTotalSchema } from './room-total.schema'
import { RoomTotalsService } from './room-totals.service'

/**
 * Written by RoomsModule and read by MetricsModule, so it belongs to neither. Registers its
 * own model; `forFeature` is idempotent, so declaring a schema twice is fine.
 */
@Module({
  imports: [MongooseModule.forFeature([
    { name: RoomTotal.name, schema: RoomTotalSchema },
    { name: Room.name, schema: RoomSchema },
    { name: EditBucket.name, schema: EditBucketSchema },
  ])],
  providers: [RoomTotalsService],
  exports: [RoomTotalsService],
})
export class RoomTotalsModule {}
