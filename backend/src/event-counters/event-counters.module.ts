import { Global, Module } from '@nestjs/common'

import { EventCountersService } from './event-counters.service'

/**
 * Global because the alternative is adding an import line to every module that could ever
 * fail, and because it genuinely is cross-cutting: it depends on nothing and holds no state
 * anybody else can affect. This is the one case in this codebase where `@Global` earns itself.
 */
@Global()
@Module({
  providers: [EventCountersService],
  exports: [EventCountersService],
})
export class EventCountersModule {}
