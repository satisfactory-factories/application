import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { RoomActivity, RoomActivitySchema } from '../rooms/schemas/room-activity.schema'
import { User, UserSchema } from '../auth/user.schema'
import { UserActivityService } from './user-activity.service'

/**
 * The account-activity stamps, in a module of their own.
 *
 * Three unrelated places touch this: the op path writes an edit stamp, the sign-in path
 * writes a sign-in stamp, and the metrics reader counts them. Those live in RealtimeModule,
 * AuthModule and MetricsModule, and hanging the service off any one of them would put a
 * cycle in the graph — MetricsModule already imports RealtimeModule for the socket count,
 * and RoomsModule already imports AuthModule.
 *
 * It registers both models itself rather than importing the modules that own them, for the
 * same reason. `forFeature` is idempotent, so declaring a schema in two modules is fine.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: RoomActivity.name, schema: RoomActivitySchema },
    ]),
  ],
  providers: [UserActivityService],
  exports: [UserActivityService],
})
export class UserActivityModule {}
