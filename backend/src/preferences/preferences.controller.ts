import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common'
import { preferencesSchema } from 'common'
import { z } from 'zod'
import type { PreferencesState } from 'common'

import { AuthTokenPayload } from '../auth/auth-token'
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard'
import { PreferencesService } from './preferences.service'
import { parseBody } from '../rooms/rooms.dto'

const putPreferencesSchema = z.object({
  prefs: preferencesSchema,
  baseRevision: z.number().int().min(0),
})

@Controller('preferences')
@UseGuards(JwtAuthGuard)
export class PreferencesController {
  constructor (private readonly preferences: PreferencesService) {}

  @Get()
  get (@CurrentUser() user: AuthTokenPayload): Promise<PreferencesState> {
    return this.preferences.get(user.id)
  }

  @Put()
  put (@CurrentUser() user: AuthTokenPayload, @Body() body: unknown): Promise<PreferencesState> {
    const { prefs, baseRevision } = parseBody(putPreferencesSchema, body)
    return this.preferences.put(user.id, prefs, baseRevision)
  }
}
