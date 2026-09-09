import { createHash } from 'node:crypto'

import { CAPS, truncateFactory, truncateString } from 'common'
import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import type {
  Factory,
  FactoryGroup,
  LegacyImportResult,
  LegacyStatusResult,
  RoomContentPayload,
} from 'common'

import { EnsureStepRunner } from './ensure-step.runner'
import { FactoryData } from '../legacy/factory-data.schema'
import { RoomsService } from './rooms.service'
import { User } from '../auth/user.schema'

export const LEGACY_ROOM_NAME = 'Restored from old cloud sync'

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

/** The tab-level half of a v0.6 whole-tab save. Empty for a v0.5 bare-array save. */
type LegacyTabState = Omit<RoomContentPayload, 'factories'> & { name?: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

/**
 * Memberless groups live only in this registry, so dropping it loses folders the
 * plan still shows. Capped and clamped like every other write into a room.
 */
const readGroups = (value: unknown): FactoryGroup[] | undefined => {
  if (!Array.isArray(value)) return undefined
  return value
    .filter(isRecord)
    .slice(0, CAPS.groupsPerPlan)
    .map(group => {
      if (typeof group.name === 'string') group.name = truncateString(group.name, CAPS.name)
      return group as unknown as FactoryGroup
    })
}

// A blank name would name the room after nothing, so it falls back like an array save.
// The tiers and `plannerVersion` stay absent when the save had none: absent is a meaning.
const readTabState = (tab: Record<string, unknown>): LegacyTabState => {
  const name = typeof tab.name === 'string' ? truncateString(tab.name, CAPS.name).trim() : ''

  return {
    ...(name ? { name } : {}),
    ...(typeof tab.plannerVersion === 'string'
      ? { plannerVersion: truncateString(tab.plannerVersion, CAPS.string) }
      : {}),
    powerTarget: readNumber(tab.powerTarget),
    depotUploadTier: readNumber(tab.depotUploadTier),
    depotExpansionTier: readNumber(tab.depotExpansionTier),
    groups: readGroups(tab.groups),
  }
}

@Injectable()
export class LegacyImportService {
  constructor (
    @InjectModel(FactoryData.name) private readonly blobs: Model<FactoryData>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly roomsService: RoomsService,
    private readonly steps: EnsureStepRunner,
  ) {}

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
          // Both stored shapes, and only the record-shaped entries, matching what
          // `loadBlob` would keep. `$data.factories` on a non-document reads as
          // missing rather than erroring, so junk falls through to the empty list.
          factoryCount: {
            $let: {
              vars: {
                entries: {
                  $cond: [
                    { $isArray: '$data' },
                    '$data',
                    { $cond: [{ $isArray: '$data.factories' }, '$data.factories', []] },
                  ],
                },
              },
              in: {
                $size: {
                  $filter: {
                    input: '$$entries',
                    cond: { $eq: [{ $type: '$$this' }, 'object'] },
                  },
                },
              },
            },
          },
        },
      },
    ])

    const factoryCount = row?.factoryCount ?? 0
    return { exists: factoryCount > 0, factoryCount }
  }

  /**
   * The upgrade itself, and the only thing that ever writes a room from the blob.
   * Both the boot path and the "Recover server copy" button land here, so there is
   * one set of rules: it adds one room under a deterministic id, it touches no room
   * the account already has, and it runs at most once per account for all time.
   */
  async recover (userId: string, username: string): Promise<LegacyImportResult> {
    // A cheap short circuit, not the gate. The claim below is what actually decides.
    if (await this.alreadyImported(userId)) {
      return { imported: false, reason: 'already_imported' }
    }

    const blob = await this.loadBlob(username)
    if (!blob) return { imported: false, reason: 'no_legacy_data' }
    const { factories, dropped, tab } = blob
    // A room named only after whatever the old save was called is indistinguishable from
    // a fresh v0.7 plan of the same name -- say plainly where it came from either way.
    const { name = LEGACY_ROOM_NAME, ...content } = tab
    const roomName = name === LEGACY_ROOM_NAME
      ? name
      : truncateString(`${name} (restored from old cloud sync)`, CAPS.name)

    const roomId = legacyImportRoomId(userId)
    const result = await this.roomsService.ensureRoom(
      userId,
      { roomId, name: roomName, factories, ...content },
      'imported',
    )

    // Stamped last, so a failure anywhere above replays the whole idempotent chain
    // and the import only counts as done once the marker is written.
    const claimed = await this.steps.run('stamp-legacy-import', () => this.claim(userId, roomId))
    if (!claimed) return { imported: false, reason: 'already_imported' }

    return dropped > 0
      ? { imported: true, room: result.room, dropped }
      : { imported: true, room: result.room }
  }

  /**
   * The serialisation point. Two callers reach here having built the same room —
   * the id is derived from the account, and `insertRoomIfAbsent` turns the loser's
   * duplicate key into a no-op — so the account is what has to be claimed, and this
   * conditional update is the one write that can do it. Whoever flips the marker
   * from unset owns the import; everyone else is told it already happened.
   */
  private async claim (userId: string, roomId: string): Promise<boolean> {
    const result = await this.users.updateOne(
      { _id: userId, legacyImportRoomId: null },
      { $set: { legacyImportRoomId: roomId } },
    )
    return result.modifiedCount === 1
  }

  /** The stamp outlives the room it made, so a deleted import is never redone. */
  private async alreadyImported (userId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(userId)) return false
    const user = await this.users.findById(userId, { legacyImportRoomId: 1 }).lean()
    return Boolean(user?.legacyImportRoomId)
  }

  /**
   * Two stored shapes: a bare `Factory[]` up to v0.5, the whole tab from v0.6, which
   * also carries the plan state the array never held. Both predate the zod schema, so
   * both are truncated and capped but not shape-validated: rejecting one would fail
   * "Recover server copy" for exactly the saves it exists for, and the client's own
   * migration path fills in whatever a record is missing.
   *
   * `dropped` is what the cap cost, reported so the recovery is not silently partial.
   */
  private async loadBlob (
    username: string,
  ): Promise<{ factories: Factory[], dropped: number, tab: LegacyTabState } | null> {
    const blob = await this.blobs.findOne({ user: username }).lean()
    if (!blob) return null

    const wholeTab = isRecord(blob.data) && Array.isArray(blob.data.factories)
      ? blob.data as { factories: unknown[] } & Record<string, unknown>
      : null
    if (!wholeTab && !Array.isArray(blob.data)) return null

    const tab = wholeTab ? readTabState(wholeTab) : {}
    const usable = (wholeTab?.factories ?? blob.data as unknown[])
      .filter((entry): entry is Factory => typeof entry === 'object' && entry !== null)

    const factories = usable
      .slice(0, CAPS.factoriesPerRoom)
      .map(factory => truncateFactory(factory))

    return factories.length > 0
      ? { factories, dropped: usable.length - factories.length, tab }
      : null
  }
}
