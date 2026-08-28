import { computed } from 'vue'
import { Factory, FactoryGroup } from '@/interfaces/planner/FactoryInterface'
import {
  applyGroupOrder,
  collectGroups,
  createGroup as createGroupIn,
  deleteGroup as deleteGroupIn,
  factoriesInGroup,
  groupedFactories,
  moveFactoriesToGroup as moveFactoriesToGroupIn,
  moveFactoryToGroup as moveFactoryToGroupIn,
  renameGroup as renameGroupIn,
  reorderGroup as reorderGroupIn,
  setGroupColor as setGroupColorIn,
} from '@/utils/factory-management/factory-groups'
import { useAppStore } from '@/stores/app-store'
import { useGroupCollapse } from '@/composables/useGroupCollapse'
import eventBus from '@/utils/eventBus'

/**
 * The one writer for group state.
 *
 * Every mutation goes through here so the two mounted sidebars (docked desktop and the
 * teleported drawer, see PlannerSidebarContent) stay pure views over the store rather than each
 * keeping their own copy of the ordering. It also guarantees the factoryUpdated emit, which is
 * what drives both the local save and the cloud sync dirty flag — a group rename touches no
 * calculation, so nothing else would announce it.
 */
export const useFactoryGroups = () => {
  const appStore = useAppStore()
  const { forgetGroup } = useGroupCollapse()

  const factories = () => appStore.getFactories()
  const tab = () => appStore.getCurrentTab()

  const sections = computed(() => groupedFactories(appStore.factories, appStore.getCurrentTab()))
  const groups = computed(() => collectGroups(appStore.factories, appStore.getCurrentTab()))

  // Announce every factory whose stored record changed. Emitting per factory rather than once
  // matches what the rest of the app does and keeps the sync store's change detection honest.
  const announce = (touched: Factory[]) => {
    touched.forEach(factory => {
      eventBus.emit('factoryUpdated', factory)
      // Intent as well as payload: a rebase only carries over factories the user
      // touched, so without this a regrouping lost to a reject is never re-sent.
      eventBus.emit('factoryEdited', factory)
    })
    // A mutation that touched no factory — renaming an empty group, reordering — still changed
    // the plan, so announce it against any factory to schedule the save. Payload only: that
    // factory was not edited, and claiming it was would overlay it over a peer's edit.
    if (!touched.length && factories().length) {
      eventBus.emit('factoryUpdated', factories()[0])
    }
  }

  const createGroup = (name: string, color?: string): FactoryGroup | null => {
    const current = tab()
    if (!current) return null
    const group = createGroupIn(factories(), current, name, color)
    announce([])
    return group
  }

  const renameGroup = (groupId: string, name: string) => {
    const current = tab()
    if (current) announce(renameGroupIn(factories(), current, groupId, name))
  }

  const setGroupColor = (groupId: string, color: string) => {
    const current = tab()
    if (current) announce(setGroupColorIn(factories(), current, groupId, color))
  }

  const reorderGroup = (groupId: string, direction: 'up' | 'down') => {
    const current = tab()
    if (!current) return
    reorderGroupIn(factories(), current, groupId, direction)
    announce([])
  }

  const setGroupOrder = (ordered: FactoryGroup[]) => {
    const current = tab()
    if (!current) return
    applyGroupOrder(factories(), current, ordered)
    announce([])
  }

  const moveFactoryToGroup = (factoryId: number, groupId: string | null, position?: number) => {
    const current = tab()
    if (current) announce(moveFactoryToGroupIn(factories(), current, factoryId, groupId, position))
  }

  // Returns the factories that actually moved — ones already in the target are not a move.
  const moveFactoriesToGroup = (factoryIds: number[], groupId: string | null): Factory[] => {
    const current = tab()
    if (!current) return []
    const touched = moveFactoriesToGroupIn(factories(), current, factoryIds, groupId)
    announce(touched)
    return touched
  }

  const deleteGroup = (groupId: string, reassignTo: string | null = null) => {
    const current = tab()
    if (!current) return
    announce(deleteGroupIn(factories(), current, groupId, reassignTo))
    forgetGroup(groupId)
  }

  const countIn = (groupId: string | null) => factoriesInGroup(appStore.factories, groupId).length

  return {
    sections,
    groups,
    countIn,
    createGroup,
    renameGroup,
    setGroupColor,
    reorderGroup,
    setGroupOrder,
    moveFactoryToGroup,
    moveFactoriesToGroup,
    deleteGroup,
  }
}
