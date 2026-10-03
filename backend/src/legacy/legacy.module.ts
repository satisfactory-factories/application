import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { AuthModule } from '../auth/auth.module'
import { FactoryData, FactoryDataSchema } from './factory-data.schema'
import { LegacyController } from './legacy.controller'
import { Share, ShareSchema } from './share.schema'

// FactoryData has no route of its own; it is registered here so the adoption
// work can inject the model without re-declaring the schema.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Share.name, schema: ShareSchema },
      { name: FactoryData.name, schema: FactoryDataSchema },
    ]),
    AuthModule, // OptionalJwtAuthGuard: a snapshot link records its author when signed in.
  ],
  controllers: [LegacyController],
  exports: [MongooseModule],
})
export class LegacyModule {}
