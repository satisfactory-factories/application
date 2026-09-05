import { HttpStatus, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import type { PreferencesState, SyncedPreferences } from 'common'

import { UserPreferences } from './user-preferences.schema'
import { isDuplicateKey, roomError } from '../rooms/room-errors'

@Injectable()
export class PreferencesService {
  constructor (
    @InjectModel(UserPreferences.name) private readonly preferences: Model<UserPreferences>,
  ) {}

  async get (userId: string): Promise<PreferencesState> {
    const stored = await this.preferences.findOne({ userId }).lean()
    return { prefs: stored?.prefs ?? {}, revision: stored?.revision ?? 0 }
  }

  /**
   * Compare-and-set on `revision`. Two devices writing at once means the loser is
   * told the current state rather than silently overwriting the winner.
   */
  async put (userId: string, prefs: SyncedPreferences, baseRevision: number): Promise<PreferencesState> {
    const updated = await this.preferences.findOneAndUpdate(
      { userId, revision: baseRevision },
      { $set: { prefs }, $inc: { revision: 1 } },
      { returnDocument: 'after' },
    ).lean()
    if (updated) return { prefs: updated.prefs, revision: updated.revision }

    if (baseRevision === 0) {
      try {
        const created = await this.preferences.create({ userId, prefs, revision: 1 })
        return { prefs: created.prefs, revision: created.revision }
      } catch (error) {
        if (!isDuplicateKey(error)) throw error
      }
    }

    const current = await this.get(userId)
    // Spread because `extra` wants an index signature and an interface has none.
    // The 409 body still carries the current state alongside `code`.
    throw roomError(
      'revision_mismatch',
      'Preferences changed elsewhere; reload before saving again.',
      HttpStatus.CONFLICT,
      { ...current },
    )
  }
}
