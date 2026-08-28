import { createHash } from 'node:crypto'

import { CAPS, truncateFactory } from 'common'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import type { Factory, LegacyImportResult } from 'common'

import { EnsureStepRunner } from './ensure-step.runner'
import { FactoryData } from '../legacy/factory-data.schema'
import { Room } from './schemas/room.schema'
import { RoomsService } from './rooms.service'
import { User } from '../auth/user.schema'

export const LEGACY_ROOM_NAME = 'Recovered plan'

/**
 * A v5 UUID over the account id, so the import lands on the same room even if the
 * `legacyImportRoomId` stamp never got written. Idempotence without a marker.
 */
export const legacyImportRoomId = (userId: string): string => {
  const bytes = createHash('sha1').update(`sf-legacy-import:${userId}`).digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
}

@Injectable()
export class LegacyImportService {
  constructor (
    @InjectModel(FactoryData.name) private readonly blobs: Model<FactoryData>,
    @InjectModel(Room.name) private readonly rooms: Model<Room>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly roomsService: RoomsService,
    private readonly steps: EnsureStepRunner,
  ) {}

  /**
   * Only for an account with no rooms whose browser reports no local tabs. Any
   * other shape gets the "Recover server copy" button instead, so nothing is
   * imported behind the user's back.
   */
  async autoImport (userId: string, username: string, localTabCount: number): Promise<LegacyImportResult> {
    if (localTabCount !== 0) return { imported: false, reason: 'not_eligible' }
    if (await this.rooms.countDocuments({ createdBy: userId, deletedAt: null }) > 0) {
      return { imported: false, reason: 'not_eligible' }
    }
    return this.recover(userId, username)
  }

  async recover (userId: string, username: string): Promise<LegacyImportResult> {
    const user = Types.ObjectId.isValid(userId) ? await this.users.findById(userId).lean() : null
    if (user?.legacyImportRoomId) {
      return { imported: false, reason: 'already_imported' }
    }

    const factories = await this.loadBlob(username)
    if (!factories) return { imported: false, reason: 'no_legacy_data' }

    const roomId = legacyImportRoomId(userId)
    const result = await this.roomsService.ensureRoom(
      userId,
      { roomId, name: LEGACY_ROOM_NAME, factories },
      'imported',
    )

    // Stamped last, so a failure anywhere above replays the whole idempotent chain
    // and the import only counts as done once the marker is written.
    await this.steps.run('stamp-legacy-import', async () => {
      await this.users.updateOne({ _id: userId }, { $set: { legacyImportRoomId: roomId } })
    })

    return { imported: true, room: result.room }
  }

  /**
   * The pre-v7 blob is a bare `Factory[]` written by a client that predates the
   * zod schema, so it is truncated and capped but not shape-validated: rejecting
   * it would make "Recover server copy" fail for exactly the saves it exists for.
   * The client's own migration path fills in whatever the record is missing.
   */
  private async loadBlob (username: string): Promise<Factory[] | null> {
    const blob = await this.blobs.findOne({ user: username }).lean()
    if (!blob || !Array.isArray(blob.data)) return null

    const factories = (blob.data as unknown[])
      .filter((entry): entry is Factory => typeof entry === 'object' && entry !== null)
      .slice(0, CAPS.factoriesPerRoom)
      .map(factory => truncateFactory(factory))

    return factories.length > 0 ? factories : null
  }
}
