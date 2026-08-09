import { computed, ref } from 'vue'
import { Factory, FactoryGroup } from '@/interfaces/planner/FactoryInterface'
import {
  applyGroupOrder,
  collectGroups,
  createGroup as createGroupIn,
  deleteGroup as deleteGroupIn,
  factoriesInGroup,
  groupedFactories,
  moveFactoryToGroup as moveFactoryToGroupIn,
  renameGroup as renameGroupIn,
  reorderGroup as reorderGroupIn,
  setGroupCollapsed as setGroupCollapsedIn,
  setGroupColor as setGroupColorIn,
} from '@/utils/factory-management/factory-groups'
import { useAppStore } from '@/stores/app-store'
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
// Ungrouped is synthesised rather than stored, so it has nowhere in the plan to keep a collapse
// flag. Module scope, not component state, so the two mounted sidebars agree on it.
const ungroupedCollapsed = ref(false)

export const useFactoryGroups = () => {
  const appStore = useAppStore()

  const factories = () => appStore.getFactories()
  const tab = () => appStore.getCurrentTab()

  const sections = computed(() => groupedFactories(appStore.factories, appStore.getCurrentTab()))
  const groups = computed(() => collectGroups(appStore.factories, appStore.getCurrentTab()))

  // Announce every factory whose stored record changed. Emitting per factory rather than once
  // matches what the rest of the app does and keeps the sync store's change detection honest.
  const announce = (touched: Factory[]) => {
    touched.forEach(factory => eventBus.emit('factoryUpdated', factory))
    // A mutation that touched no factory — renaming an empty group, reordering — still changed
    // the plan, so announce it against any factory to schedule the save.
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

  const setGroupCollapsed = (groupId: string, collapsed: boolean) => {
    const current = tab()
    if (current) announce(setGroupCollapsedIn(factories(), current, groupId, collapsed))
  }

  const toggleGroup = (group: FactoryGroup) => setGroupCollapsed(group.id, !group.collapsed)

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

  const deleteGroup = (groupId: string, reassignTo: string | null = null) => {
    const current = tab()
    if (current) announce(deleteGroupIn(factories(), current, groupId, reassignTo))
  }

  const countIn = (groupId: string | null) => factoriesInGroup(appStore.factories, groupId).length

  return {
    sections,
    groups,
    countIn,
    ungroupedCollapsed,
    createGroup,
    renameGroup,
    setGroupColor,
    setGroupCollapsed,
    toggleGroup,
    reorderGroup,
    setGroupOrder,
    moveFactoryToGroup,
    deleteGroup,
  }
}
