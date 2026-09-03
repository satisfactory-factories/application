import { createHash } from 'node:crypto'

import { CAPS, truncateFactory } from 'common'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import type { Factory, LegacyImportResult, LegacyStatusResult } from 'common'

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

  /**
   * Whether the account still has an old save to offer, and how big it is. The
   * count is computed inside the aggregation, so a multi-megabyte blob costs one
   * integer and never crosses the wire. Already imported reads as nothing to
   * offer, because that is all `recover` would answer.
   */
  async status (userId: string, username: string): Promise<LegacyStatusResult> {
    if (await this.alreadyImported(userId)) return { exists: false, factoryCount: 0 }

    const [row] = await this.blobs.aggregate<{ factoryCount: number }>([
      { $match: { user: username } },
      {
        $project: {
          _id: 0,
          // Only the record-shaped entries, matching what `loadBlob` would keep.
          factoryCount: {
            $cond: [
              { $isArray: '$data' },
              {
                $size: {
                  $filter: {
                    input: '$data',
                    cond: { $eq: [{ $type: '$$this' }, 'object'] },
                  },
                },
              },
              0,
            ],
          },
        },
      },
    ])

    const factoryCount = row?.factoryCount ?? 0
    return { exists: factoryCount > 0, factoryCount }
  }

  async recover (userId: string, username: string): Promise<LegacyImportResult> {
    if (await this.alreadyImported(userId)) {
      return { imported: false, reason: 'already_imported' }
    }

    const blob = await this.loadBlob(username)
    if (!blob) return { imported: false, reason: 'no_legacy_data' }
    const { factories, dropped } = blob

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

    return dropped > 0
      ? { imported: true, room: result.room, dropped }
      : { imported: true, room: result.room }
  }

  /** The stamp outlives the room it made, so a deleted import is never redone. */
  private async alreadyImported (userId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(userId)) return false
    const user = await this.users.findById(userId, { legacyImportRoomId: 1 }).lean()
    return Boolean(user?.legacyImportRoomId)
  }

  /**
   * The pre-v7 blob is a bare `Factory[]` written by a client that predates the
   * zod schema, so it is truncated and capped but not shape-validated: rejecting
   * it would make "Recover server copy" fail for exactly the saves it exists for.
   * The client's own migration path fills in whatever the record is missing.
   *
   * `dropped` is what the cap cost, reported so the recovery is not silently partial.
   */
  private async loadBlob (username: string): Promise<{ factories: Factory[], dropped: number } | null> {
    const blob = await this.blobs.findOne({ user: username }).lean()
    if (!blob || !Array.isArray(blob.data)) return null

    const usable = (blob.data as unknown[])
      .filter((entry): entry is Factory => typeof entry === 'object' && entry !== null)

    const factories = usable
      .slice(0, CAPS.factoriesPerRoom)
      .map(factory => truncateFactory(factory))

    return factories.length > 0
      ? { factories, dropped: usable.length - factories.length }
      : null
  }
}
