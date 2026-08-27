import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Param, Post, UseGuards } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { factoryTabSchema } from 'common'
import type { EndpointRemovedBody, FactoryTab } from 'common'

import { AuthTokenPayload } from '../auth/auth-token'
import { OptionalJwtAuthGuard, OptionalUser } from '../auth/jwt-auth.guard'
import { SkipVersionGate } from '../common/decorators/skip-version-gate.decorator'
import { Share } from './share.schema'
import { generateSlug } from '../rooms/slug'
import { isDuplicateKey } from '../rooms/room-errors'
import { parseContentBody } from '../rooms/rooms.dto'

export const ENDPOINT_REMOVED: EndpointRemovedBody = {
  code: 'endpoint_removed',
  message: 'Whole-plan save and load were replaced by synced tabs in v7.',
}

/** Share ids are three words; a collision just means picking three more. */
const SHARE_ID_ATTEMPTS = 5

export const ANONYMOUS_SHARE_AUTHOR = 'Anonymous'

export interface ShareCreatedResponse {
  status: 'success'
  shareId: string
}

@Controller()
export class LegacyController {
  constructor (@InjectModel(Share.name) private readonly shareModel: Model<Share>) {}

  /**
   * Snapshot links: a frozen, read-only-in-time copy of one tab. Any tab, no
   * account needed. Separate from collaboration invites, which live on rooms.
   */
  @Post('share')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OptionalJwtAuthGuard)
  async createShare (
    @OptionalUser() user: AuthTokenPayload | null,
    @Body() body: unknown,
  ): Promise<ShareCreatedResponse> {
    const tab = parseContentBody<FactoryTab>(factoryTabSchema, body)

    for (let attempt = 0; attempt < SHARE_ID_ATTEMPTS; attempt++) {
      const id = generateSlug()
      try {
        await this.shareModel.create({
          id,
          data: JSON.stringify(tab),
          createdBy: user?.username ?? ANONYMOUS_SHARE_AUTHOR,
        })
        return { status: 'success', shareId: id }
      } catch (error) {
        if (!isDuplicateKey(error)) throw error
      }
    }

    throw new HttpException(
      { message: 'Could not allocate a share link, please try again.' },
      HttpStatus.SERVICE_UNAVAILABLE,
    )
  }

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
