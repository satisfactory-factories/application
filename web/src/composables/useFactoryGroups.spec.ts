import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useFactoryGroups } from '@/composables/useFactoryGroups'
import { useAppStore } from '@/stores/app-store'
import { newFactory } from '@/utils/factory-management/factory'
import type { Factory } from '@/interfaces/planner/FactoryInterface'
import eventBus from '@/utils/eventBus'

/**
 * The composable is the one writer for group state, so it is also the one place that can say a
 * regrouping happened: nothing recalculates, and a rebase carries over only what the user is
 * recorded as having touched. `factoryEdited` is that record; `tabEdited` is its tab-level twin.
 */
describe('useFactoryGroups: sync intent', () => {
  let appStore: ReturnType<typeof useAppStore>
  let groups: ReturnType<typeof useFactoryGroups>

  // mitt's emit is overloaded on the event name, so the recorded calls need widening
  // before they can be read back as a plain list of pairs.
  const emitted = (event: string): unknown[] =>
    (vi.mocked(eventBus.emit).mock.calls as unknown as [string, unknown][])
      .filter(([name]) => name === event)
      .map(([, payload]) => payload)

  const intentFor = (): Factory[] => emitted('factoryEdited') as Factory[]

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    appStore = useAppStore()
    // Filled in place: the store captures its current tab by reference at creation, so a
    // replacement array leaves `getFactories()` reading the tab it was born with.
    const tab = appStore.getCurrentTab()
    tab.factories = [newFactory('Alpha', 0, 1), newFactory('Beta', 1, 2), newFactory('Gamma', 2, 3)]
    tab.groups = []
    tab.powerTarget = 0
    groups = useFactoryGroups()
    vi.spyOn(eventBus, 'emit').mockClear()
  })

  it('declares the group list against the tab, even when no factory moved', () => {
    groups.createGroup('Smelting')

    expect(emitted('tabEdited')).toContain('groups')
    expect(intentFor()).toEqual([])
  })

  // The whole plan is re-sorted and re-indexed on every group mutation, so the records that
  // changed are not only the one named. Left unmarked, the rest come back on the server's
  // old indexes and the plan renders in an order nobody chose.
  it('declares every factory the regroup reindexed, not only the one moved', () => {
    const group = groups.createGroup('Smelting')
    vi.mocked(eventBus.emit).mockClear()

    // Ungrouped sorts first, so grouping Alpha sends it to the end and shifts the other two up.
    groups.moveFactoryToGroup(1, group!.id)

    expect(appStore.getFactories().map(factory => factory.name)).toEqual(['Beta', 'Gamma', 'Alpha'])
    expect(intentFor().map(factory => factory.id).sort()).toEqual([1, 2, 3])
  })

  it('declares a rename against the members whose copy of the group changed', () => {
    const group = groups.createGroup('Smelting')
    groups.moveFactoryToGroup(1, group!.id)
    vi.mocked(eventBus.emit).mockClear()

    groups.renameGroup(group!.id, 'Ingots')

    expect(intentFor().map(factory => factory.id)).toEqual([1])
    expect(emitted('tabEdited')).toContain('groups')
  })

  it('marks a factory once however many ways the mutation touched it', () => {
    const group = groups.createGroup('Smelting')
    vi.mocked(eventBus.emit).mockClear()

    // Alpha is both the record named and one the reindex moved.
    groups.moveFactoryToGroup(1, group!.id)

    expect(intentFor().filter(factory => factory.id === 1)).toHaveLength(1)
  })
})
