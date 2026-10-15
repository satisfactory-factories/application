import { toRaw } from 'vue'
import type { Factory, FactoryGroup, FactoryTab, RecipeUnlocks, RoomDiff, RoomSnapshot } from 'common'

/**
 * The pure half of the sync engine: the acknowledged baseline, the diff between
 * it and local state, and the byte-identical merge a receiver applies. Nothing
 * here touches Pinia, the socket or localStorage, so the consistency contract
 * can be tested without any of them.
 */

/** The mutable half of a room, as both the server and the local tab hold it. */
export interface RoomContent {
  name: string
  powerTarget: number
  depotUploadTier?: number
  depotExpansionTier?: number
  plannerVersion?: string
  groups: FactoryGroup[]
  recipeUnlocks?: RecipeUnlocks
  factories: Factory[]
}

/**
 * Every tab-owned field a diff can carry. `groups` and `recipeUnlocks` are the odd ones out:
 * they are compared and stored serialized, while the rest are scalars compared by value.
 */
export const TAB_SCALARS = [
  'name',
  'powerTarget',
  'depotUploadTier',
  'depotExpansionTier',
  'plannerVersion',
] as const

export const TAB_FIELDS = [...TAB_SCALARS, 'groups', 'recipeUnlocks'] as const
export type TabField = typeof TAB_FIELDS[number]
export type TabScalar = typeof TAB_SCALARS[number]

/**
 * Stands in for acked content we never actually saw — the post-restart case,
 * where the mirror is on disk but the baseline it was acked against is not.
 * An entry holding it always reads as changed, and blocks reconstructing server
 * state from the baseline.
 */
export const UNKNOWN_CONTENT = '\u0000unknown'

/**
 * What each tab scalar's baseline becomes when it is unknown: a value the real one can
 * never equal, so the field always reads as changed. NaN for the numbers, since it fails
 * every comparison including against itself.
 */
export const UNKNOWN_SCALAR: Record<TabScalar, string | number> = {
  name: UNKNOWN_CONTENT,
  powerTarget: Number.NaN,
  depotUploadTier: Number.NaN,
  depotExpansionTier: Number.NaN,
  plannerVersion: UNKNOWN_CONTENT,
}

/**
 * The last acknowledged server state. Factories are kept as serialized records
 * rather than objects: the string is both the fingerprint a diff compares
 * against and the content a rebase reconstructs from.
 */
export interface AckedState {
  revision: number
  name: string
  powerTarget: number
  depotUploadTier?: number
  depotExpansionTier?: number
  plannerVersion?: string
  /** `stableStringify` of the group list. */
  groups: string
  /** `stableStringify` of the unlock list; absent until a save has been loaded. */
  recipeUnlocks?: string
  /** Factory id to its serialized record, in the server's own order. */
  factories: Map<number, string>
}

export interface DiffResult {
  diff: RoomDiff
  /** The baseline this op becomes once acked — retained, never recomputed. */
  sent: AckedState
}

/**
 * JSON with object keys sorted, so two structurally equal records always
 * produce the same string. Plain `JSON.stringify` would make a fingerprint
 * depend on key insertion order, which a round-trip through Mongo does not
 * preserve.
 */
export const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(entry => stableStringify(entry)).join(',')}]`

  const parts: string[] = []
  for (const key of Object.keys(value as object).sort()) {
    const child = (value as Record<string, unknown>)[key]
    if (child === undefined) continue
    parts.push(`${JSON.stringify(key)}:${stableStringify(child)}`)
  }
  return `{${parts.join(',')}}`
}

const serializedUnlocks = (unlocks: RecipeUnlocks | undefined): string | undefined =>
  unlocks === undefined ? undefined : stableStringify(unlocks)

export const emptyAcked = (revision = 0): AckedState => ({
  revision,
  name: '',
  powerTarget: 0,
  groups: stableStringify([]),
  factories: new Map(),
})

export const ackedFromContent = (content: RoomContent, revision: number): AckedState => ({
  revision,
  name: content.name,
  powerTarget: content.powerTarget,
  depotUploadTier: content.depotUploadTier,
  depotExpansionTier: content.depotExpansionTier,
  plannerVersion: content.plannerVersion,
  groups: stableStringify(content.groups),
  recipeUnlocks: serializedUnlocks(content.recipeUnlocks),
  factories: new Map(content.factories.map(factory => [factory.id, stableStringify(factory)])),
})

export const contentFromSnapshot = (snapshot: RoomSnapshot): RoomContent => ({
  name: snapshot.name,
  powerTarget: snapshot.powerTarget ?? 0,
  depotUploadTier: snapshot.depotUploadTier,
  depotExpansionTier: snapshot.depotExpansionTier,
  plannerVersion: snapshot.plannerVersion,
  groups: snapshot.groups ?? [],
  recipeUnlocks: snapshot.recipeUnlocks,
  factories: snapshot.factories ?? [],
})

/** Null when any part of the baseline is a placeholder, so it cannot be replayed. */
export const contentFromAcked = (acked: AckedState): RoomContent | null => {
  if (acked.groups === UNKNOWN_CONTENT || acked.recipeUnlocks === UNKNOWN_CONTENT) return null
  for (const field of TAB_SCALARS) {
    const value = acked[field]
    if (value === UNKNOWN_CONTENT || (typeof value === 'number' && Number.isNaN(value))) return null
  }

  const factories: Factory[] = []
  for (const serialized of acked.factories.values()) {
    if (serialized === UNKNOWN_CONTENT) return null
    factories.push(JSON.parse(serialized) as Factory)
  }
  return {
    name: acked.name,
    powerTarget: acked.powerTarget,
    depotUploadTier: acked.depotUploadTier,
    depotExpansionTier: acked.depotExpansionTier,
    plannerVersion: acked.plannerVersion,
    groups: JSON.parse(acked.groups) as FactoryGroup[],
    recipeUnlocks: acked.recipeUnlocks === undefined ? undefined : JSON.parse(acked.recipeUnlocks) as RecipeUnlocks,
    factories,
  }
}

/** The tab as raw objects: reactive proxies must never reach a clone or the wire. */
export const contentOfTab = (tab: FactoryTab): RoomContent => ({
  name: tab.name,
  powerTarget: tab.powerTarget ?? 0,
  depotUploadTier: tab.depotUploadTier,
  depotExpansionTier: tab.depotExpansionTier,
  plannerVersion: tab.plannerVersion,
  groups: toRaw(tab.groups ?? []).map(group => toRaw(group)),
  recipeUnlocks: toRaw(tab.recipeUnlocks),
  factories: toRaw(tab.factories).map(factory => toRaw(factory)),
})

/**
 * Replace-by-id, then append. The byte-identical mirror of the server's own
 * merge — a receiver must land on exactly the state the server stored.
 */
export const mergeFactories = (current: Factory[], diff: RoomDiff): Factory[] => {
  const removed = new Set(diff.removedFactoryIds ?? [])
  const incoming = new Map((diff.factories ?? []).map(factory => [factory.id, factory]))

  const merged = current
    .filter(factory => !removed.has(factory.id))
    .map(factory => incoming.get(factory.id) ?? factory)

  const present = new Set(merged.map(factory => factory.id))
  for (const factory of incoming.values()) {
    if (!present.has(factory.id) && !removed.has(factory.id)) merged.push(factory)
  }

  return merged
}

const touchesFactories = (diff: RoomDiff): boolean =>
  diff.factories !== undefined || diff.removedFactoryIds !== undefined

export const applyDiffToContent = (content: RoomContent, diff: RoomDiff): RoomContent => ({
  name: diff.name ?? content.name,
  powerTarget: diff.powerTarget ?? content.powerTarget,
  depotUploadTier: diff.depotUploadTier ?? content.depotUploadTier,
  depotExpansionTier: diff.depotExpansionTier ?? content.depotExpansionTier,
  plannerVersion: diff.plannerVersion ?? content.plannerVersion,
  groups: diff.groups ?? content.groups,
  recipeUnlocks: diff.recipeUnlocks ?? content.recipeUnlocks,
  factories: touchesFactories(diff) ? mergeFactories(content.factories, diff) : content.factories,
})

export const applyDiffToAcked = (acked: AckedState, diff: RoomDiff, revision: number): AckedState => {
  const factories = new Map(acked.factories)
  for (const id of diff.removedFactoryIds ?? []) factories.delete(id)
  for (const factory of diff.factories ?? []) factories.set(factory.id, stableStringify(factory))

  return {
    revision,
    name: diff.name ?? acked.name,
    powerTarget: diff.powerTarget ?? acked.powerTarget,
    depotUploadTier: diff.depotUploadTier ?? acked.depotUploadTier,
    depotExpansionTier: diff.depotExpansionTier ?? acked.depotExpansionTier,
    plannerVersion: diff.plannerVersion ?? acked.plannerVersion,
    groups: diff.groups === undefined ? acked.groups : stableStringify(diff.groups),
    recipeUnlocks: diff.recipeUnlocks === undefined ? acked.recipeUnlocks : stableStringify(diff.recipeUnlocks),
    factories,
  }
}

/**
 * Everything local state has that the baseline does not — ripples included,
 * which is what makes a receiver's replace-by-id enough. Null when the two
 * agree and there is nothing to send.
 */
export const buildDiff = (acked: AckedState, local: RoomContent): DiffResult | null => {
  const diff: RoomDiff = {}
  const sentFactories = new Map<number, string>()
  const changed: Factory[] = []

  for (const factory of local.factories) {
    const serialized = stableStringify(factory)
    sentFactories.set(factory.id, serialized)
    // Parsed back out rather than referenced: the payload is then a plain deep
    // copy by construction, and provably the record the fingerprint describes.
    if (acked.factories.get(factory.id) !== serialized) changed.push(JSON.parse(serialized) as Factory)
  }

  const removed = [...acked.factories.keys()].filter(id => !sentFactories.has(id))

  if (changed.length > 0) diff.factories = changed
  if (removed.length > 0) diff.removedFactoryIds = removed

  // A scalar the local tab does not carry stays out of the diff: `undefined` is how the
  // wire says "unchanged", so there would be no way to express clearing it anyway, and
  // nothing in the planner ever clears one back to absent.
  for (const field of TAB_SCALARS) {
    const value = local[field]
    if (value === undefined || value === acked[field]) continue
    Object.assign(diff, { [field]: value })
  }

  const groups = stableStringify(local.groups)
  if (groups !== acked.groups) diff.groups = JSON.parse(groups) as FactoryGroup[]

  // Optional like the scalars: a tab that never loaded a save has nothing to say about it.
  const recipeUnlocks = serializedUnlocks(local.recipeUnlocks)
  if (recipeUnlocks !== undefined && recipeUnlocks !== acked.recipeUnlocks) {
    diff.recipeUnlocks = JSON.parse(recipeUnlocks) as RecipeUnlocks
  }

  if (Object.keys(diff).length === 0) return null

  return {
    diff,
    sent: {
      revision: acked.revision,
      name: local.name,
      powerTarget: local.powerTarget,
      depotUploadTier: local.depotUploadTier ?? acked.depotUploadTier,
      depotExpansionTier: local.depotExpansionTier ?? acked.depotExpansionTier,
      plannerVersion: local.plannerVersion ?? acked.plannerVersion,
      groups,
      recipeUnlocks: recipeUnlocks ?? acked.recipeUnlocks,
      factories: sentFactories,
    },
  }
}
