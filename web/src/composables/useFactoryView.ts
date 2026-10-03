import { computed, ref } from 'vue'
import { isPlannerView, OVERVIEW, PlannerView } from '@/utils/factory-management/planner-view'

/**
 * Which page of the plan the planner pane is showing: the overview, or one factory.
 *
 * View state, kept out of the plan for the same reason group collapse is (see useGroupCollapse):
 * it is where this browser is looking, not something to sync to everyone else in the room. It
 * lives under its own localStorage key so a reload, or switching tabs and back, returns to the
 * factory that was open.
 *
 * Namespaced by plan, since factory ids are only unique within one. `usePlan()` names the plan on
 * screen; every read and write is scoped to it.
 *
 * Module scope rather than component state, so the sidebars and the planner agree on it.
 */
const STORAGE_KEY = 'plannerView'

type ViewStore = Record<string, PlannerView>

const restore = (): ViewStore => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {}
    return Object.fromEntries(Object.entries(stored).filter(([, view]) => isPlannerView(view))) as ViewStore
  } catch {
    return {}
  }
}

const store = ref<ViewStore>(restore())
const planId = ref('')

const persist = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store.value))
  } catch {
    // Storage full or unavailable: the view still changes, it just will not survive a reload.
  }
}

export const useFactoryView = () => {
  /** Name the plan whose view is in play. Called when the planner mounts and on every tab switch. */
  const usePlan = (id: string) => {
    planId.value = id
  }

  /**
   * The remembered view. A factory id here may name a factory that has since gone (deleted on
   * another device, a plan replaced by an import), so the planner checks it against the plan and
   * shows the overview when it does not resolve.
   */
  const view = computed<PlannerView>(() => store.value[planId.value] ?? OVERVIEW)

  const setView = (next: PlannerView) => {
    if (store.value[planId.value] === next) return
    store.value = { ...store.value, [planId.value]: next }
    persist()
  }

  return { view, setView, usePlan }
}
