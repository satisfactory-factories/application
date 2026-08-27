import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { PreferencesController } from './preferences.controller'
import { PreferencesService } from './preferences.service'
import { UserPreferences, UserPreferencesSchema } from './user-preferences.schema'

@Module({
  imports: [
    MongooseModule.forFeature([{ name: UserPreferences.name, schema: UserPreferencesSchema }]),
  ],
  controllers: [PreferencesController],
  providers: [PreferencesService],
  exports: [PreferencesService, MongooseModule],
})
export class PreferencesModule {}
