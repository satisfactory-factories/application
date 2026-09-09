import type { Factory, RoomDiff } from 'common'
import { stableStringify } from '@/sync/room-state'

/**
 * What counts as the plan changing, for the "last updated" line in the tab bar.
 * Renaming a factory, dragging one somewhere else, regrouping it or collapsing its
 * card are not changes to the plan, so the fingerprint leaves them out and a diff
 * carrying nothing else reads as no change at all.
 */
const IGNORED: (keyof Factory)[] = [
  'name',
  'displayOrder',
  'group',
  'hidden',
  'checklistPanelHidden',
]

export const contentPrint = (factory: Factory): string => {
  const record: Record<string, unknown> = { ...factory }
  for (const field of IGNORED) delete record[field]
  return stableStringify(record)
}

/** Tab-owned fields that are plan content. The room's name is not, and nor is its group list. */
const CONTENT_FIELDS = ['powerTarget', 'depotUploadTier', 'depotExpansionTier'] as const

/**
 * Whether an inbound op actually changed what the plan says, measured against the
 * records this client currently holds. A peer's reorder or rename arrives as a diff
 * like any other, and neither is worth flashing at the user.
 */
export const diffChangesContent = (diff: RoomDiff, current: Factory[]): boolean => {
  if (diff.removedFactoryIds?.length) return true
  if (CONTENT_FIELDS.some(field => diff[field] !== undefined)) return true
  if (!diff.factories?.length) return false

  const prints = new Map(current.map(factory => [factory.id, contentPrint(factory)]))
  return diff.factories.some(factory => prints.get(factory.id) !== contentPrint(factory))
}
