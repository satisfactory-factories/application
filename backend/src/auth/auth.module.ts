import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtAuthGuard, OptionalJwtAuthGuard } from './jwt-auth.guard'
import { User, UserSchema } from './user.schema'

@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, OptionalJwtAuthGuard],
  exports: [AuthService, JwtAuthGuard, OptionalJwtAuthGuard, MongooseModule],
})
export class AuthModule {}
