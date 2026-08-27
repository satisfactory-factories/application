import type { Factory, RoomDiff, RoomSnapshot } from 'common'

import { Room } from '../rooms/schemas/room.schema'

/** The room as the wire sees it: never `passwordHash`, never `appliedOps`. */
export const toRoomSnapshot = (room: Room): RoomSnapshot => ({
  roomId: room.roomId,
  name: room.name,
  slug: room.slug,
  shared: room.shared,
  hasPassword: room.passwordHash !== null,
  factories: room.factories,
  powerTarget: room.powerTarget,
  groups: room.groups,
  revision: room.revision,
  createdBy: room.createdBy,
})

/**
 * A diff carries whole factory records, so applying one is replace-by-id plus
 * append. Order is preserved for records that survive; new ones go on the end.
 */
export const mergeFactories = (current: Factory[], diff: RoomDiff): Factory[] => {
  const removed = new Set(diff.removedFactoryIds ?? [])
  const incoming = new Map((diff.factories ?? []).map(factory => [factory.id, factory]))

  const merged = current
    .filter(factory => !removed.has(factory.id))
    .map(factory => incoming.get(factory.id) ?? factory)

  const present = new Set(merged.map(factory => factory.id))
  for (const factory of diff.factories ?? []) {
    if (!present.has(factory.id) && !removed.has(factory.id)) merged.push(factory)
  }

  return merged
}
