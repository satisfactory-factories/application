import { PROTOCOL_VERSION } from 'common'
import type { TabField } from '@/sync/room-state'
import type { JournalConflict } from '@/sync/plan-journal'
import { writeLocalStorage } from '@/utils/safe-storage'

/**
 * Sync metadata for a synced tab, kept in a sidecar map so
 * `localStorage.factoryTabs` keeps today's exact shape — it is the render
 * mirror, and what makes a rollback land on readable data.
 */
export const TAB_MIRROR_META_KEY = 'tabMirrorMeta'

export interface TabMirrorMeta {
  /** The revision the mirror's content was last acknowledged at. */
  revision: number
  appVersion: string
  /** Intent that survives a restart: the acked baseline itself does not. */
  userTouchedIds: number[]
  userTouchedFields: TabField[]
  /**
   * Records a bulk action removed, still unacknowledged. Persisted because the server
   * refuses undeclared removals, and a restart between the clear and its ack would
   * otherwise send them undeclared and have the whole plan handed back.
   */
  declaredRemovals: number[]
  /**
   * Factory id to a fingerprint of the acked record, for the edited ones only. The
   * baseline itself does not survive a restart, and without these a device reopened
   * later cannot tell a factory somebody else changed from one only it changed.
   */
  baselinePrints?: Record<string, string>
  /**
   * A clash the user was asked about and has not answered. The question itself only ever
   * lived in memory, so a reload landed on a baseline already advanced to the server's
   * revision, answered `up_to_date`, and flushed this device's version over the peer's
   * without anybody choosing it. Persisted, the send barrier and the question both come back.
   */
  conflict?: JournalConflict
}

export type TabMirrorMetaMap = Record<string, TabMirrorMeta>

const readPrints = (value: unknown): Record<string, string> => {
  if (typeof value !== 'object' || value === null) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, print]) => typeof print === 'string'),
  ) as Record<string, string>
}

const readConflict = (value: unknown): JournalConflict | undefined => {
  if (typeof value !== 'object' || value === null) return undefined
  const candidate = value as Partial<JournalConflict>
  if (typeof candidate.revision !== 'number' || !Array.isArray(candidate.factoryIds)) return undefined

  const factoryIds = candidate.factoryIds.filter((id): id is number => typeof id === 'number')
  return factoryIds.length > 0 ? { revision: candidate.revision, factoryIds } : undefined
}

const isMeta = (value: unknown): value is TabMirrorMeta =>
  typeof value === 'object' && value !== null && typeof (value as TabMirrorMeta).revision === 'number'

export const readTabMirrorMeta = (): TabMirrorMetaMap => {
  const raw = localStorage.getItem(TAB_MIRROR_META_KEY)
  if (!raw) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null) return {}

  const map: TabMirrorMetaMap = {}
  for (const [tabId, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!isMeta(value)) continue
    map[tabId] = {
      revision: value.revision,
      appVersion: typeof value.appVersion === 'string' ? value.appVersion : PROTOCOL_VERSION,
      userTouchedIds: Array.isArray(value.userTouchedIds) ? value.userTouchedIds.filter(id => typeof id === 'number') : [],
      userTouchedFields: Array.isArray(value.userTouchedFields) ? value.userTouchedFields : [],
      declaredRemovals: Array.isArray(value.declaredRemovals)
        ? value.declaredRemovals.filter(id => typeof id === 'number')
        : [],
      baselinePrints: readPrints(value.baselinePrints),
      conflict: readConflict(value.conflict),
    }
  }
  return map
}

export const writeTabMirrorMeta = (map: TabMirrorMetaMap): boolean =>
  writeLocalStorage(TAB_MIRROR_META_KEY, JSON.stringify(map))

export const setTabMirrorMeta = (tabId: string, meta: TabMirrorMeta): void => {
  const map = readTabMirrorMeta()
  map[tabId] = meta
  writeTabMirrorMeta(map)
}

export const removeTabMirrorMeta = (tabId: string): void => {
  const map = readTabMirrorMeta()
  if (!(tabId in map)) return
  delete map[tabId]
  writeTabMirrorMeta(map)
}

/** Drops metadata for tabs the mirror no longer holds, so the map cannot grow forever. */
export const pruneTabMirrorMeta = (knownTabIds: string[]): void => {
  const known = new Set(knownTabIds)
  const map = readTabMirrorMeta()
  let dropped = false

  for (const tabId of Object.keys(map)) {
    if (known.has(tabId)) continue
    delete map[tabId]
    dropped = true
  }

  if (dropped) writeTabMirrorMeta(map)
}
