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
import { captureOrder, markFactoryEdited, markTabEdited, reorderedFactories } from '@/utils/sync-intent'

/**
 * The one writer for group state.
 *
 * Every mutation goes through here so the two mounted sidebars (docked desktop and the
 * teleported drawer, see PlannerSidebarContent) stay pure views over the store rather than each
 * keeping their own copy of the ordering. It also guarantees the announce below, which is what
 * saves the plan and records the sync intent — a group rename touches no calculation, so
 * nothing else would say anything happened.
 */
export const useFactoryGroups = () => {
  const appStore = useAppStore()
  const { forgetGroup } = useGroupCollapse()

  const factories = () => appStore.getFactories()
  const tab = () => appStore.getCurrentTab()

  const sections = computed(() => groupedFactories(appStore.factories, appStore.getCurrentTab()))
  const groups = computed(() => collectGroups(appStore.factories, appStore.getCurrentTab()))

  /**
   * Announce every factory whose stored record changed: the ones the mutation named, plus the
   * ones its reindex moved underneath it. Payload and intent both — a rebase carries over only
   * factories the user touched, so without the intent a regrouping lost to a reject is gone.
   */
  const announce = (before: Map<number, string>, touched: Factory[]) => {
    const changed = new Set([...touched, ...reorderedFactories(before, factories())])
    changed.forEach(factory => markFactoryEdited(factory))
    // The group list itself lives on the tab, and a mutation that touched no factory —
    // renaming an empty group, reordering, creating one in an empty plan — changes only that.
    markTabEdited('groups')
  }

  const createGroup = (name: string, color?: string): FactoryGroup | null => {
    const current = tab()
    if (!current) return null
    const before = captureOrder(factories())
    const group = createGroupIn(factories(), current, name, color)
    announce(before, [])
    return group
  }

  const renameGroup = (groupId: string, name: string) => {
    const current = tab()
    if (!current) return
    const before = captureOrder(factories())
    announce(before, renameGroupIn(factories(), current, groupId, name))
  }

  const setGroupColor = (groupId: string, color: string) => {
    const current = tab()
    if (!current) return
    const before = captureOrder(factories())
    announce(before, setGroupColorIn(factories(), current, groupId, color))
  }

  const reorderGroup = (groupId: string, direction: 'up' | 'down') => {
    const current = tab()
    if (!current) return
    const before = captureOrder(factories())
    reorderGroupIn(factories(), current, groupId, direction)
    announce(before, [])
  }

  const setGroupOrder = (ordered: FactoryGroup[]) => {
    const current = tab()
    if (!current) return
    const before = captureOrder(factories())
    applyGroupOrder(factories(), current, ordered)
    announce(before, [])
  }

  const moveFactoryToGroup = (factoryId: number, groupId: string | null, position?: number) => {
    const current = tab()
    if (!current) return
    const before = captureOrder(factories())
    announce(before, moveFactoryToGroupIn(factories(), current, factoryId, groupId, position))
  }

  // Returns the factories that actually moved — ones already in the target are not a move.
  const moveFactoriesToGroup = (factoryIds: number[], groupId: string | null): Factory[] => {
    const current = tab()
    if (!current) return []
    const before = captureOrder(factories())
    const touched = moveFactoriesToGroupIn(factories(), current, factoryIds, groupId)
    announce(before, touched)
    return touched
  }

  const deleteGroup = (groupId: string, reassignTo: string | null = null) => {
    const current = tab()
    if (!current) return
    const before = captureOrder(factories())
    announce(before, deleteGroupIn(factories(), current, groupId, reassignTo))
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
