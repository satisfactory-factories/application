import { Controller, Get, HttpCode, HttpException, HttpStatus, Param, Post } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import type { EndpointRemovedBody } from 'common'

import { SkipVersionGate } from '../common/decorators/skip-version-gate.decorator'
import { Share } from './share.schema'

export const ENDPOINT_REMOVED: EndpointRemovedBody = {
  code: 'endpoint_removed',
  message: 'Whole-plan save and load were replaced by synced tabs in v7.',
}

@Controller()
export class LegacyController {
  constructor (@InjectModel(Share.name) private readonly shareModel: Model<Share>) {}

  // Exempt from the version gate: share links are public and long-lived, so a
  // client of any age must still be able to open one.
  @Get('share/:id')
  @SkipVersionGate()
  async getShare (@Param('id') id: string): Promise<{ data: unknown }> {
    try {
      // One atomic update rather than read-mutate-save: concurrent views of a
      // popular link used to overwrite each other's count.
      const share = await this.shareModel.findOneAndUpdate(
        { id },
        { $inc: { views: 1 }, $set: { lastViewed: new Date() } },
        { returnDocument: 'after' },
      ).lean()

      if (!share) throw new HttpException({ message: 'Share link not found' }, HttpStatus.NOT_FOUND)

      return { data: JSON.parse(share.data) }
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error(`Failed to fetch shared data: ${error}`)
      throw new HttpException(
        { message: 'Failed to fetch shared data', error },
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }
  }

  @Post('save')
  @HttpCode(HttpStatus.GONE)
  save (): EndpointRemovedBody {
    return ENDPOINT_REMOVED
  }

  @Get('load')
  @HttpCode(HttpStatus.GONE)
  load (): EndpointRemovedBody {
    return ENDPOINT_REMOVED
  }
}
