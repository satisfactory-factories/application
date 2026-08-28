import type { RoomRole } from 'common'

/**
 * What a tab *is*, as opposed to what it holds. Kept in its own localStorage key
 * so `localStorage.factoryTabs` keeps today's exact shape — it is the render
 * mirror, and what makes a rollback to v6 land on readable data.
 *
 * `local`  — this browser only, no account.
 * `synced` — a room on the server; `shared` tells private from collaborative.
 * `joined` — an anonymous pointer into someone else's shared room.
 */
export const TAB_SYNC_STATE_KEY = 'tabSyncStates'

export type TabSyncKind = 'local' | 'synced' | 'joined'

export interface TabSyncState {
  kind: TabSyncKind
  /** The room is shared, so the tab is collaborative rather than private. */
  shared: boolean
  role: RoomRole
  /** Server revision as last reported by the room list or the live engine. */
  revision: number | null
}

export type TabSyncStateMap = Record<string, TabSyncState>

export const LOCAL_TAB_STATE: TabSyncState = Object.freeze({
  kind: 'local',
  shared: false,
  role: 'owner',
  revision: null,
})

const KINDS: TabSyncKind[] = ['local', 'synced', 'joined']

/** Repairs whatever it finds rather than throwing: this map is never worth a crash. */
const toState = (value: unknown): TabSyncState | null => {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Partial<TabSyncState>
  if (!KINDS.includes(candidate.kind as TabSyncKind)) return null

  return {
    kind: candidate.kind as TabSyncKind,
    shared: candidate.shared === true,
    role: candidate.role === 'member' ? 'member' : 'owner',
    revision: typeof candidate.revision === 'number' ? candidate.revision : null,
  }
}

export const readTabSyncStates = (): TabSyncStateMap => {
  const raw = localStorage.getItem(TAB_SYNC_STATE_KEY)
  if (!raw) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null) return {}

  const map: TabSyncStateMap = {}
  for (const [tabId, value] of Object.entries(parsed as Record<string, unknown>)) {
    const state = toState(value)
    if (state) map[tabId] = state
  }
  return map
}

export const writeTabSyncStates = (map: TabSyncStateMap): void => {
  localStorage.setItem(TAB_SYNC_STATE_KEY, JSON.stringify(map))
}

/** A tab the user can hand to someone else, as opposed to a private synced one. */
export const isCollaborative = (state: TabSyncState): boolean =>
  state.kind === 'joined' || (state.kind === 'synced' && state.shared)
