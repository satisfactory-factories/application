import { ref } from 'vue'
import { UNGROUPED_ID } from '@/utils/factory-management/factory-groups'

/**
 * Which groups are shut, and which have ever been open.
 *
 * View state, deliberately kept out of the plan. It used to live on the group record, which is
 * denormalised onto every member factory — so one collapse rewrote `factory.group` on all of them
 * and emitted factoryUpdated per factory, running a save and a metrics recalculation per member
 * just to hide some rows. A forty-factory group took seconds to open. It lives under its own
 * localStorage key instead, so it survives a reload without travelling with a shared or
 * cloud-restored plan.
 *
 * Namespaced by plan. Group ids survive a copied plan or a duplicated tab, and Ungrouped has no id
 * at all, so a single flat set meant collapsing Ungrouped in one plan collapsed it in every plan,
 * and two copies of a plan drove each other's groups. `usePlan()` names the plan on screen; every
 * read and write is scoped to it.
 *
 * Module scope rather than component state, because the sidebar is mounted twice at once (docked
 * and drawer) and both have to agree with the planner.
 */
const STORAGE_KEY = 'factoryGroupsCollapsed'

type CollapseStore = Record<string, string[]>

const restore = (): CollapseStore => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    // Anything that is not a plan-keyed object is discarded rather than adopted: the only other
    // shape this key ever held was an unnamespaced array, which cannot be attributed to a plan.
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {}

    return Object.fromEntries(
      Object.entries(stored)
        .filter(([, ids]) => Array.isArray(ids))
        .map(([plan, ids]) => [plan, (ids as unknown[]).filter(id => typeof id === 'string') as string[]]),
    )
  } catch {
    return {}
  }
}

const store = ref<CollapseStore>(restore())
const planId = ref('')

// The groups shut when a plan first came on screen have never had their factories mounted, and
// nothing mounts them until they are opened. Everything else stays mounted and is merely hidden, so
// every toggle after the first is a style change rather than forty cards torn down and rebuilt.
const neverOpened = ref<Record<string, Set<string>>>({})

const EMPTY: readonly string[] = []
const NONE = new Set<string>()

const keyOf = (groupId: string | null) => groupId ?? UNGROUPED_ID

const persist = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(store.value))

export const useGroupCollapse = () => {
  const shut = () => store.value[planId.value] ?? EMPTY

  /**
   * Name the plan whose collapse state is in play. Called when the planner mounts and on every tab
   * switch; until it is, nothing is collapsed and everything mounts, which is the right default for
   * a plan nobody has told us about.
   */
  const usePlan = (id: string) => {
    if (!neverOpened.value[id]) neverOpened.value[id] = new Set(store.value[id] ?? [])
    planId.value = id
  }

  const isCollapsed = (groupId: string | null) => shut().includes(keyOf(groupId))

  /** Whether this section's factories belong in the DOM at all — hidden or otherwise. */
  const isMounted = (groupId: string | null) =>
    !(neverOpened.value[planId.value] ?? NONE).has(keyOf(groupId))

  const setCollapsed = (groupId: string | null, close: boolean) => {
    if (!planId.value) return
    const key = keyOf(groupId)
    const current = shut()

    if (close) {
      if (current.includes(key)) return
      store.value[planId.value] = [...current, key]
    } else {
      store.value[planId.value] = current.filter(entry => entry !== key)
      neverOpened.value[planId.value]?.delete(key)
    }
    persist()
  }

  const toggleCollapsed = (groupId: string | null) => setCollapsed(groupId, !isCollapsed(groupId))

  /** Drop a deleted group's state, so its id cannot linger in storage forever. */
  const forgetGroup = (groupId: string) => {
    if (!planId.value) return
    store.value[planId.value] = shut().filter(entry => entry !== groupId)
    neverOpened.value[planId.value]?.delete(groupId)
    persist()
  }

  return { usePlan, isCollapsed, isMounted, setCollapsed, toggleCollapsed, forgetGroup }
}
