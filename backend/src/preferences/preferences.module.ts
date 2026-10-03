import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { AuthModule } from '../auth/auth.module'
import { PreferencesController } from './preferences.controller'
import { PreferencesService } from './preferences.service'
import { UserPreferences, UserPreferencesSchema } from './user-preferences.schema'

@Module({
  imports: [
    MongooseModule.forFeature([{ name: UserPreferences.name, schema: UserPreferencesSchema }]),
    AuthModule, // JwtAuthGuard, which reads the account's token version to run.
  ],
  controllers: [PreferencesController],
  providers: [PreferencesService],
  exports: [PreferencesService, MongooseModule],
})
export class PreferencesModule {}
