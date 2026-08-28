import { PROTOCOL_VERSION } from 'common'
import type { TabField } from '@/sync/room-state'

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
}

export type TabMirrorMetaMap = Record<string, TabMirrorMeta>

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
    }
  }
  return map
}

export const writeTabMirrorMeta = (map: TabMirrorMetaMap): void => {
  localStorage.setItem(TAB_MIRROR_META_KEY, JSON.stringify(map))
}

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
