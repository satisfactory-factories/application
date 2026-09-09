import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { Factory, FactoryTab } from 'common'
import { contentPrint } from '@/sync/plan-activity'
import { useAppStore } from '@/stores/app-store'
import type { TabField } from '@/sync/room-state'
import eventBus from '@/utils/eventBus'

/** Survives a reload, so a plan opened in the morning still says when it last moved. */
const STORAGE_KEY = 'lastPlanUpdate'

/** Plenty for the 25-membership cap, and it stops a long-lived browser growing the map. */
const MAX_TABS = 60

/** One trailing pass per burst of edits, rather than a fingerprint per keystroke. */
export const ACTIVITY_DEBOUNCE_MS = 300

const readStamps = (): Record<string, number> => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    return stored && typeof stored === 'object' ? stored as Record<string, number> : {}
  } catch {
    return {}
  }
}

/**
 * When each tab's plan last actually changed — the user's own edits and a peer's
 * applied ops alike. Renames and reorders deliberately do not count: the tab bar
 * flashes this line, and flashing it because somebody dragged a card is noise.
 */
export const usePlanActivityStore = defineStore('planActivity', () => {
  const appStore = useAppStore()

  const stamps = ref<Record<string, number>>(readStamps())

  /** The last fingerprint seen per factory, for the tab the tracker is following. */
  let prints = new Map<number, string>()
  let followed: string | null = null
  let pending = new Set<Factory>()
  let timer: ReturnType<typeof setTimeout> | undefined

  const persist = () => {
    const entries = Object.entries(stamps.value)
      .sort(([, left], [, right]) => right - left)
      .slice(0, MAX_TABS)
    stamps.value = Object.fromEntries(entries)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stamps.value))
    } catch {
      // A browser refusing storage costs the reader a relative time, nothing more.
    }
  }

  const lastUpdatedAt = (tabId: string): number | null => stamps.value[tabId] ?? null

  const bump = (tabId: string, at = Date.now()) => {
    stamps.value = { ...stamps.value, [tabId]: at }
    persist()
  }

  /** Re-reads every record, so the tracker knows what "unchanged" looks like from here. */
  const follow = (tabId: string, factories: Factory[]) => {
    followed = tabId
    prints = new Map(factories.map(factory => [factory.id, contentPrint(factory)]))
    pending = new Set()
  }

  const followCurrentTab = () => {
    const tab = appStore.getCurrentTab()
    if (tab) follow(tab.id, tab.factories)
  }

  /**
   * The trailing edge of a burst. Only the records the burst announced are
   * fingerprinted; a change in how many the plan holds means one was added or
   * removed, which is a change on its own and is the only case that re-reads
   * the whole plan.
   */
  const settleTab = (tab: FactoryTab | undefined) => {
    timer = undefined
    const announced = pending
    pending = new Set()

    if (!tab) return
    if (tab.id !== followed) {
      follow(tab.id, tab.factories)
      return
    }

    const resized = tab.factories.length !== prints.size
    let changed = resized
    for (const factory of announced) {
      const print = contentPrint(factory)
      if (prints.get(factory.id) !== print) changed = true
      prints.set(factory.id, print)
    }

    if (!changed) return
    if (resized) follow(tab.id, tab.factories)
    bump(tab.id)
  }

  // A load half-fills the plan array, so its length says nothing until it finishes.
  const settle = () => settleTab(appStore.isLoaded ? appStore.getCurrentTab() : undefined)

  const schedule = () => {
    if (timer === undefined) timer = setTimeout(settle, ACTIVITY_DEBOUNCE_MS)
  }

  const onFactoryUpdated = (factory: Factory) => {
    // A load announces every factory it rebuilds; that is not the plan changing.
    if (!appStore.isLoaded) return
    pending.add(factory)
    schedule()
  }

  /** Tab-owned content. The room's name is a rename and its group list is an arrangement. */
  const onTabEdited = (field: TabField) => {
    if (!appStore.isLoaded || field === 'name' || field === 'groups') return
    const tab = appStore.getCurrentTab()
    if (tab) bump(tab.id)
  }

  /** A peer's op that carried something other than a rename or a reorder. */
  const onRemoteContent = ({ tabId }: { tabId: string }) => {
    bump(tabId)
    if (tabId === followed) followCurrentTab()
  }

  const onLoadingCompleted = () => followCurrentTab()

  eventBus.on('factoryUpdated', onFactoryUpdated)
  eventBus.on('tabEdited', onTabEdited)
  eventBus.on('planContentApplied', onRemoteContent)
  eventBus.on('loadingCompleted', onLoadingCompleted)

  // Switching tabs is not an edit, so the baseline moves with the user rather than
  // the first edit on the new tab being swallowed by a reseed. A burst still owed to
  // the tab being left is flushed first, while `prints` still describes it: measured
  // against the new tab's fingerprints it reads as no change and is lost.
  const stopTabWatch = watch(() => appStore.getCurrentTab()?.id, (_next, previous) => {
    if (timer !== undefined && previous !== undefined) {
      clearTimeout(timer)
      settleTab(appStore.getTab(previous))
    }
    followCurrentTab()
  })

  followCurrentTab()

  const dispose = () => {
    clearTimeout(timer)
    timer = undefined
    stopTabWatch()
    eventBus.off('factoryUpdated', onFactoryUpdated)
    eventBus.off('tabEdited', onTabEdited)
    eventBus.off('planContentApplied', onRemoteContent)
    eventBus.off('loadingCompleted', onLoadingCompleted)
  }

  return {
    stamps,
    lastUpdatedAt,
    bump,
    followCurrentTab,
    dispose,
  }
})
