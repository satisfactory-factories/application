import { ref } from 'vue'
import { UNGROUPED_ID } from '@/utils/factory-management/factory-groups'

/**
 * Which groups are shut, and which have ever been open.
 *
 * View state, deliberately kept out of the plan. It used to live on the group record, which is
 * denormalised onto every member factory — so one collapse rewrote `factory.group` on all of them
 * and emitted factoryUpdated per factory, running a save and a metrics recalculation per member
 * just to hide some rows. A forty-factory group took seconds to open. Keyed by group id, Ungrouped
 * included (as a synthesised section it had nowhere in the plan to persist at all), under its own
 * localStorage key: it survives a reload without travelling with a shared or cloud-restored plan.
 *
 * Module scope rather than component state, because the sidebar is mounted twice at once (docked
 * and drawer) and both have to agree with the planner.
 */
const STORAGE_KEY = 'factoryGroupsCollapsed'

const restore = (): string[] => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(stored) ? stored.filter(id => typeof id === 'string') : []
  } catch {
    return []
  }
}

const collapsed = ref(new Set<string>(restore()))

// A group already shut when the plan loaded has never had its factories mounted, and nothing
// mounts them until it is opened. Everything else stays mounted and is merely hidden, so every
// toggle after the first is a style change rather than forty cards torn down and rebuilt.
const neverOpened = ref(new Set<string>(collapsed.value))

const keyOf = (groupId: string | null) => groupId ?? UNGROUPED_ID

const persist = () => localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsed.value]))

export const useGroupCollapse = () => {
  const isCollapsed = (groupId: string | null) => collapsed.value.has(keyOf(groupId))

  /** Whether this section's factories belong in the DOM at all — hidden or otherwise. */
  const isMounted = (groupId: string | null) => !neverOpened.value.has(keyOf(groupId))

  const setCollapsed = (groupId: string | null, shut: boolean) => {
    const key = keyOf(groupId)
    if (shut) {
      collapsed.value.add(key)
    } else {
      collapsed.value.delete(key)
      neverOpened.value.delete(key)
    }
    persist()
  }

  const toggleCollapsed = (groupId: string | null) => setCollapsed(groupId, !isCollapsed(groupId))

  /** Drop a deleted group's state, so its id cannot linger in storage forever. */
  const forgetGroup = (groupId: string) => {
    collapsed.value.delete(groupId)
    neverOpened.value.delete(groupId)
    persist()
  }

  return { isCollapsed, isMounted, setCollapsed, toggleCollapsed, forgetGroup }
}
