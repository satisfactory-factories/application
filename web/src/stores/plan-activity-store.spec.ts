import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useAppStore } from '@/stores/app-store'
import { ACTIVITY_DEBOUNCE_MS, usePlanActivityStore } from '@/stores/plan-activity-store'
import { addProductToFactory } from '@/utils/factory-management/products'
import { newFactory } from '@/utils/factory-management/factory'
import eventBus from '@/utils/eventBus'

describe('plan-activity-store', () => {
  let appStore: ReturnType<typeof useAppStore>
  let store: ReturnType<typeof usePlanActivityStore>

  const tabId = () => appStore.currentFactoryTab.id

  const seedPlan = () => {
    const tab = appStore.getCurrentTab()
    tab.factories.splice(0, tab.factories.length)
    tab.factories.push(newFactory('Smelters', 0, 1))
    store.followCurrentTab()
    return tab
  }

  /** One burst of edits, settled. */
  const settle = () => vi.advanceTimersByTime(ACTIVITY_DEBOUNCE_MS)

  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
    setActivePinia(createPinia())

    appStore = useAppStore()
    appStore.isLoaded = true
    store = usePlanActivityStore()
  })

  afterEach(() => {
    store.dispose()
    vi.useRealTimers()
  })

  it('bumps when a factory gains a product', () => {
    const tab = seedPlan()
    expect(store.lastUpdatedAt(tabId())).toBeNull()

    addProductToFactory(tab.factories[0], { id: 'IronIngot', amount: 60, recipe: 'IngotIron' })
    eventBus.emit('factoryUpdated', tab.factories[0])
    settle()

    expect(store.lastUpdatedAt(tabId())).not.toBeNull()
  })

  it('does not bump for a rename', () => {
    const tab = seedPlan()

    tab.factories[0].name = 'Steel Beams'
    eventBus.emit('factoryUpdated', tab.factories[0])
    settle()

    expect(store.lastUpdatedAt(tabId())).toBeNull()
  })

  it('does not bump for a reorder or a regroup', () => {
    const tab = seedPlan()
    tab.factories.push(newFactory('Constructors', 1, 2))
    store.followCurrentTab()

    tab.factories[0].displayOrder = 1
    tab.factories[1].displayOrder = 0
    tab.factories[0].group = { id: 'group-1', name: 'Steel', color: '#fff', order: 0 }
    for (const factory of tab.factories) eventBus.emit('factoryUpdated', factory)
    settle()

    expect(store.lastUpdatedAt(tabId())).toBeNull()
  })

  it('bumps when a factory is removed, which no fingerprint of its own would show', () => {
    const tab = seedPlan()
    tab.factories.push(newFactory('Constructors', 1, 2))
    store.followCurrentTab()

    const [removed] = tab.factories.splice(1, 1)
    eventBus.emit('factoryUpdated', removed)
    settle()

    expect(store.lastUpdatedAt(tabId())).not.toBeNull()
  })

  it('bumps for a tab-owned content field, but not for the tab name or its groups', () => {
    seedPlan()

    eventBus.emit('tabEdited', 'name')
    eventBus.emit('tabEdited', 'groups')
    expect(store.lastUpdatedAt(tabId())).toBeNull()

    eventBus.emit('tabEdited', 'powerTarget')
    expect(store.lastUpdatedAt(tabId())).not.toBeNull()
  })

  it('bumps for a peer\'s applied op', () => {
    seedPlan()

    eventBus.emit('planContentApplied', { tabId: tabId() })

    expect(store.lastUpdatedAt(tabId())).not.toBeNull()
  })

  it('ignores everything a load announces', () => {
    const tab = seedPlan()
    appStore.isLoaded = false

    addProductToFactory(tab.factories[0], { id: 'IronIngot', amount: 60, recipe: 'IngotIron' })
    eventBus.emit('factoryUpdated', tab.factories[0])
    settle()

    expect(store.lastUpdatedAt(tabId())).toBeNull()
  })

  it('keeps a stamp per tab, and remembers them across a reload', async () => {
    seedPlan()
    store.bump('other-tab', 1_000)
    store.bump(tabId(), 2_000)
    await nextTick()

    setActivePinia(createPinia())
    const reloaded = usePlanActivityStore()

    expect(reloaded.lastUpdatedAt('other-tab')).toBe(1_000)
    expect(reloaded.lastUpdatedAt(tabId())).toBe(2_000)
    reloaded.dispose()
  })
})
