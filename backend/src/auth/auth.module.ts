import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { AccountEventsService } from './account-events.service'
import { AccountTokenService } from './account-token.service'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtAuthGuard, OptionalJwtAuthGuard } from './jwt-auth.guard'
import { User, UserSchema } from './user.schema'
import { UserActivityModule } from '../user-activity/user-activity.module'

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    UserActivityModule, // The sign-in stamp.
  ],
  controllers: [AuthController],
  providers: [AuthService, AccountTokenService, AccountEventsService, JwtAuthGuard, OptionalJwtAuthGuard],
  // AccountTokenService and the account bus are exported for the WS gateway: the handshake
  // makes the same staleness check the guards do, and the sockets are what a revocation kicks.
  exports: [
    AuthService,
    AccountTokenService,
    AccountEventsService,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    MongooseModule,
  ],
})
export class AuthModule {}
