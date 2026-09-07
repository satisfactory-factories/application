import { PROTOCOL_VERSION } from 'common'
import type { TabField } from '@/sync/room-state'
import { writeLocalStorage } from '@/utils/safe-storage'

/**
 * The durable home for everything one browser instance has NOT yet sent.
 *
 * `localStorage.factoryTabs` and `tabMirrorMeta` are both whole-value writes over one
 * shared key, so a second tab of the same browser replaces them with its own generation.
 * Its copy of a plan another tab edited offline is stale, and its copy of the sync
 * metadata never carried the other tab's intent at all — so the edit disappears from the
 * content and from the record that it was owed.
 *
 * This key is partitioned by instance instead: an instance only ever rewrites its own
 * slot, and boot takes the union of every slot. Each room entry carries the revision, the
 * intent, the local content of the touched records and any unanswered conflict together,
 * in one write, so all four describe the same durable generation.
 */
export const PLAN_JOURNAL_KEY = 'planSyncJournal'

/** Where this instance's id is kept: per browser tab, and it survives a reload. */
export const INSTANCE_ID_KEY = 'planInstanceId'

/** A slot nobody has written for this long is a browser tab that is not coming back. */
export const JOURNAL_SLOT_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** A question raised on this device and never answered. */
export interface JournalConflict {
  /** The revision of the snapshot that raised it. */
  revision: number
  factoryIds: number[]
}

export interface JournalRoom {
  revision: number
  appVersion: string
  userTouchedIds: number[]
  userTouchedFields: TabField[]
  declaredRemovals: number[]
  baselinePrints: Record<string, string>
  /**
   * The unsent edit itself: each touched factory as this instance holds it. Without this
   * the intent survives a sibling tab's overwrite and the content it refers to does not,
   * so the rebase would push the sibling's stale copy back at the room as ours.
   */
  records: Record<string, string>
  conflict?: JournalConflict
}

export interface JournalSlot {
  instanceId: string
  /** Last written. Only ever used to order two slots that both hold a record. */
  at: number
  rooms: Record<string, JournalRoom>
}

export type PlanJournal = Record<string, JournalSlot>

const asStringMap = (value: unknown): Record<string, string> => {
  if (typeof value !== 'object' || value === null) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, entry]) => typeof entry === 'string'),
  ) as Record<string, string>
}

const asNumbers = (value: unknown): number[] =>
  Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === 'number') : []

const asConflict = (value: unknown): JournalConflict | undefined => {
  if (typeof value !== 'object' || value === null) return undefined
  const candidate = value as Partial<JournalConflict>
  if (typeof candidate.revision !== 'number') return undefined
  const factoryIds = asNumbers(candidate.factoryIds)
  if (factoryIds.length === 0) return undefined
  return { revision: candidate.revision, factoryIds }
}

/** Repairs whatever it finds rather than throwing: this map is never worth a crash. */
const asRoom = (value: unknown): JournalRoom | null => {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Partial<JournalRoom>
  if (typeof candidate.revision !== 'number') return null

  return {
    revision: candidate.revision,
    appVersion: typeof candidate.appVersion === 'string' ? candidate.appVersion : PROTOCOL_VERSION,
    userTouchedIds: asNumbers(candidate.userTouchedIds),
    userTouchedFields: Array.isArray(candidate.userTouchedFields) ? candidate.userTouchedFields : [],
    declaredRemovals: asNumbers(candidate.declaredRemovals),
    baselinePrints: asStringMap(candidate.baselinePrints),
    records: asStringMap(candidate.records),
    conflict: asConflict(candidate.conflict),
  }
}

const asSlot = (instanceId: string, value: unknown): JournalSlot | null => {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Partial<JournalSlot>
  const rooms: Record<string, JournalRoom> = {}

  for (const [roomId, entry] of Object.entries(candidate.rooms ?? {})) {
    const room = asRoom(entry)
    if (room) rooms[roomId] = room
  }
  return { instanceId, at: typeof candidate.at === 'number' ? candidate.at : 0, rooms }
}

/**
 * Per browser tab and stable across a reload, which is what `sessionStorage` is for. A
 * browser that refuses it (private mode, blocked site data) still gets an id, just one
 * that does not outlive the page — the union at boot is what makes that survivable.
 */
let cachedInstanceId: string | null = null

export const instanceId = (): string => {
  if (cachedInstanceId) return cachedInstanceId

  try {
    const stored = sessionStorage.getItem(INSTANCE_ID_KEY)
    if (stored) {
      cachedInstanceId = stored
      return stored
    }
  } catch {
    // Falls through to a fresh id held in memory.
  }

  cachedInstanceId = crypto.randomUUID()
  try {
    sessionStorage.setItem(INSTANCE_ID_KEY, cachedInstanceId)
  } catch {
    // An id nobody can store still partitions this instance from its siblings.
  }
  return cachedInstanceId
}

/** Only for tests: a fresh page load is a fresh read of `sessionStorage`. */
export const forgetInstanceId = (): void => {
  cachedInstanceId = null
}

export const readPlanJournal = (): PlanJournal => {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(PLAN_JOURNAL_KEY)
  } catch {
    return {}
  }
  if (!raw) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null) return {}

  const journal: PlanJournal = {}
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    const slot = asSlot(id, value)
    if (slot) journal[id] = slot
  }
  return journal
}

const writePlanJournal = (journal: PlanJournal): boolean =>
  writeLocalStorage(PLAN_JOURNAL_KEY, JSON.stringify(journal))

/**
 * Read, change this instance's slot, write. A sibling writing in the same breath can lose
 * one heartbeat, and never a room entry it owns: every instance rewrites its own slot on
 * its next persist, so the loss heals itself within one debounce window.
 *
 * @returns whether the disk took it. False is what stops the caller advancing a revision.
 */
export const writeJournalRoom = (roomId: string, room: JournalRoom): boolean => {
  const id = instanceId()
  const journal = readPlanJournal()
  const slot = journal[id] ?? { instanceId: id, at: 0, rooms: {} }

  slot.at = Date.now()
  slot.rooms[roomId] = room
  journal[id] = slot

  if (writePlanJournal(journal)) return true

  // A plan with hundreds of edited records can be what tipped the quota. The intent alone
  // is a fraction of the size and is still worth more than nothing, so try again without
  // the records — the rebase then falls back to today's behaviour for those ids.
  slot.rooms[roomId] = { ...room, records: {} }
  return writePlanJournal(journal)
}

export const dropJournalRoom = (roomId: string): void => {
  const id = instanceId()
  const journal = readPlanJournal()
  const slot = journal[id]
  if (!slot || !(roomId in slot.rooms)) return

  delete slot.rooms[roomId]
  slot.at = Date.now()
  writePlanJournal(journal)
}

/** Keeps this instance's slot alive so a stale-slot sweep can tell it from an abandoned one. */
export const touchJournalSlot = (): void => {
  const id = instanceId()
  const journal = readPlanJournal()
  const slot = journal[id]
  if (!slot) return

  slot.at = Date.now()
  writePlanJournal(journal)
}

/**
 * What this browser still owes for one room, across every instance that has ever written
 * here. Deliberately a union rather than newest-wins: the bug this exists for is a sibling
 * tab writing a newer generation that never carried the older tab's edit, so taking the
 * newest slot alone would drop exactly the thing being rescued.
 *
 * Ties on one factory go to this instance, then to the most recently written slot.
 */
export const recoverJournalRoom = (roomId: string): JournalRoom | null => {
  const id = instanceId()
  const journal = readPlanJournal()

  const slots = Object.values(journal)
    .filter(slot => slot.rooms[roomId] !== undefined)
    // Ours last, so its records and prints overwrite everything else's.
    .sort((left, right) => {
      if (left.instanceId === id) return 1
      if (right.instanceId === id) return -1
      return left.at - right.at
    })
  if (slots.length === 0) return null

  const touched = new Set<number>()
  const fields = new Set<TabField>()
  const removals = new Set<number>()
  const baselinePrints: Record<string, string> = {}
  const records: Record<string, string> = {}
  let revision = 0
  let appVersion = PROTOCOL_VERSION
  let conflict: JournalConflict | undefined

  for (const slot of slots) {
    const room = slot.rooms[roomId]
    for (const factoryId of room.userTouchedIds) touched.add(factoryId)
    for (const field of room.userTouchedFields) fields.add(field)
    for (const factoryId of room.declaredRemovals) removals.add(factoryId)
    Object.assign(baselinePrints, room.baselinePrints)
    Object.assign(records, room.records)
    // The revision is about the shared mirror, so the furthest-along answer is the truthful
    // one: a slot left behind at an older revision has not seen what the newer one adopted.
    if (room.revision >= revision) {
      revision = room.revision
      appVersion = room.appVersion
    }
    if (room.conflict) conflict = room.conflict
  }

  return {
    revision,
    appVersion,
    userTouchedIds: [...touched],
    userTouchedFields: [...fields],
    declaredRemovals: [...removals],
    baselinePrints,
    records,
    conflict,
  }
}

/**
 * Drops room entries for tabs this browser no longer holds, and whole slots from browser
 * tabs that are long gone, so the key cannot grow forever. Deliberately generous: a slot
 * is only swept once it is a month old, because sweeping one that still owes an edit is
 * the failure this whole module exists to stop.
 */
export const prunePlanJournal = (knownTabIds: string[], now = Date.now()): void => {
  const known = new Set(knownTabIds)
  const journal = readPlanJournal()
  const mine = instanceId()
  let changed = false

  for (const [id, slot] of Object.entries(journal)) {
    for (const roomId of Object.keys(slot.rooms)) {
      if (known.has(roomId)) continue
      delete slot.rooms[roomId]
      changed = true
    }
    const empty = Object.keys(slot.rooms).length === 0
    if (id !== mine && (empty || now - slot.at > JOURNAL_SLOT_TTL_MS)) {
      delete journal[id]
      changed = true
    }
  }

  if (changed) writePlanJournal(journal)
}
