/**
 * factory-groups.ts — folders for factories.
 *
 * THE INVARIANT, which everything here exists to maintain:
 *
 *   The factories array is stored group-contiguous, in group order, Ungrouped first, and
 *   `displayOrder` is the index into it.
 *
 * That is load-bearing. The planner's render loop, the scroll-spy's document-order scan
 * (Planner.vue), the Factories Summary and the up/down buttons all read that array or that index,
 * so grouping is expressed as its sort rather than as a parallel structure. Break the invariant
 * and nothing throws — the plan just renders in an order that disagrees with the sidebar, and the
 * scroll-spy highlights the wrong factory. Call sortFactoriesByGroup() after any structural change.
 *
 * THE OTHER ODDITY: the group record is denormalised onto every member factory (see FactoryGroup
 * in the interfaces). FactoryTab.groups holds only groups with no members. reconcileGroups()
 * merges the two and is what lets a cloud restore — which ships a bare Factory[] — rebuild the
 * whole group set from the factories alone.
 */
import { Factory, FactoryGroup, FactoryTab } from '@/interfaces/planner/FactoryInterface'
import { groupPalette } from '@/utils/colors'

export interface FactoryGroupSection {
  // null is the synthesised Ungrouped section. It is never stored.
  group: FactoryGroup | null
  factories: Factory[]
}

export const UNGROUPED_ID = '__ungrouped__'

export const generateGroupId = (): string =>
  `g-${crypto.randomUUID().slice(0, 8)}`

export const defaultGroupColor = (existing: FactoryGroup[] = []): string => {
  // Walk the palette rather than always handing out green, so a plan built quickly ends up
  // legible without the user colouring anything.
  const used = new Set(existing.map(group => group.color))
  return groupPalette.find(entry => !used.has(entry.value))?.value ?? groupPalette[0].value
}

const cloneGroup = (group: FactoryGroup): FactoryGroup => ({ ...group })

/**
 * Every group in the plan, ordered, from both carriers.
 *
 * Factories win: they are the copies that survive transport. Where two factories disagree about
 * one id — a plan half-written during a rename — the one on the earliest factory wins, which is
 * arbitrary but deterministic, so every client converges on the same answer.
 */
export const collectGroups = (factories: Factory[], tab?: FactoryTab): FactoryGroup[] => {
  const byId = new Map<string, FactoryGroup>()

  for (const factory of factories) {
    if (factory.group && !byId.has(factory.group.id)) {
      byId.set(factory.group.id, cloneGroup(factory.group))
    }
  }

  // Registry entries only fill in what no factory carries: the empty groups.
  for (const group of tab?.groups ?? []) {
    if (!byId.has(group.id)) {
      byId.set(group.id, cloneGroup(group))
    }
  }

  return [...byId.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
}

/**
 * Bring both carriers into agreement, and normalise group order to a dense 0..n-1.
 *
 * Runs on load and after any structural change. Writing the winning record back onto every member
 * is what converges the disagreement described in collectGroups.
 */
export const reconcileGroups = (factories: Factory[], tab?: FactoryTab): FactoryGroup[] => {
  const groups = collectGroups(factories, tab)
  groups.forEach((group, index) => {
    group.order = index
  })

  const byId = new Map(groups.map(group => [group.id, group]))

  for (const factory of factories) {
    if (!factory.group) continue
    const canonical = byId.get(factory.group.id)
    // A group id on a factory is always real by construction — collectGroups just read it — so
    // this only ever rewrites a stale copy, never drops a membership.
    factory.group = canonical ? cloneGroup(canonical) : undefined
  }

  if (tab) {
    // Keep only the groups nothing carries; anything with a member is already safe.
    const carried = new Set(factories.map(factory => factory.group?.id).filter(Boolean))
    tab.groups = groups.filter(group => !carried.has(group.id)).map(cloneGroup)
  }

  return groups
}

const groupSortKey = (factory: Factory, groups: FactoryGroup[]): number => {
  if (!factory.group) return -1 // Ungrouped first
  const index = groups.findIndex(group => group.id === factory.group!.id)
  return index === -1 ? -1 : index
}

/**
 * Re-establish the invariant: group-contiguous, in group order, Ungrouped first, displayOrder
 * dense and index-aligned. Order within a group is preserved from the array's current order.
 */
export const sortFactoriesByGroup = (factories: Factory[], groups: FactoryGroup[]): Factory[] => {
  // A stable sort on the group key alone keeps each group's internal order exactly as it was,
  // which is what makes this safe to call after any mutation without scrambling the user's work.
  const keyed = factories.map((factory, index) => ({ factory, index, key: groupSortKey(factory, groups) }))
  keyed.sort((a, b) => a.key - b.key || a.index - b.index)

  factories.splice(0, factories.length, ...keyed.map(entry => entry.factory))
  factories.forEach((factory, index) => {
    factory.displayOrder = index
  })

  return factories
}

// The render model. One derivation, consumed by both the sidebar and the planner.
export const groupedFactories = (factories: Factory[], tab?: FactoryTab): FactoryGroupSection[] => {
  const groups = collectGroups(factories, tab)
  const ungrouped = factories.filter(factory => !factory.group)

  const sections: FactoryGroupSection[] = []

  // Omitted when empty — an Ungrouped heading over nothing is noise, and a plan that has never
  // used groups must look exactly as it does today.
  if (ungrouped.length) {
    sections.push({ group: null, factories: ungrouped })
  }

  for (const group of groups) {
    // Stored empty groups are included deliberately: a group created before anything is put in it
    // still has to render, accept a drop and be deletable.
    sections.push({
      group,
      factories: factories.filter(factory => factory.group?.id === group.id),
    })
  }

  return sections
}

export const factoriesInGroup = (factories: Factory[], groupId: string | null): Factory[] =>
  factories.filter(factory => (factory.group?.id ?? null) === groupId)

// ---------------------------------------------------------------------------
// Mutations. Each returns the affected factories so the caller can emit factoryUpdated for
// them — that event is what drives both the local save and the cloud sync dirty flag.
//
// They reorder `factories` IN PLACE to keep the invariant, so never iterate that array while
// calling one; snapshot the ids you want to act on first.
// ---------------------------------------------------------------------------

export const createGroup = (
  factories: Factory[],
  tab: FactoryTab,
  name: string,
  color?: string,
): FactoryGroup => {
  const groups = collectGroups(factories, tab)
  const group: FactoryGroup = {
    id: generateGroupId(),
    name: name.trim() || 'New group',
    color: color ?? defaultGroupColor(groups),
    order: groups.length,
  }

  tab.groups = [...(tab.groups ?? []), cloneGroup(group)]
  return group
}

// One helper behind rename and recolour: they differ only in which field changes, and both have
// to fan the new record out to every member. Collapse is deliberately not one of them — see
// useGroupCollapse, which keeps it out of the plan precisely because this fan-out is expensive.
const updateGroup = (
  factories: Factory[],
  tab: FactoryTab,
  groupId: string,
  patch: Partial<FactoryGroup>,
): Factory[] => {
  const touched: Factory[] = []

  for (const factory of factories) {
    if (factory.group?.id !== groupId) continue
    factory.group = { ...factory.group, ...patch }
    touched.push(factory)
  }

  tab.groups = (tab.groups ?? []).map(group =>
    group.id === groupId ? { ...group, ...patch } : group
  )

  return touched
}

export const renameGroup = (factories: Factory[], tab: FactoryTab, groupId: string, name: string) =>
  updateGroup(factories, tab, groupId, { name: name.trim() || 'Untitled group' })

export const setGroupColor = (factories: Factory[], tab: FactoryTab, groupId: string, color: string) =>
  updateGroup(factories, tab, groupId, { color })

/** Move a group up or down the plan, taking its factories with it. */
export const reorderGroup = (
  factories: Factory[],
  tab: FactoryTab,
  groupId: string,
  direction: 'up' | 'down',
): FactoryGroup[] => {
  const groups = collectGroups(factories, tab)
  const index = groups.findIndex(group => group.id === groupId)
  const target = direction === 'up' ? index - 1 : index + 1
  if (index === -1 || target < 0 || target >= groups.length) return groups

  const [moved] = groups.splice(index, 1)
  groups.splice(target, 0, moved)
  groups.forEach((group, position) => {
    group.order = position
  })

  applyGroupOrder(factories, tab, groups)
  return groups
}

/** Write an explicit group ordering back to both carriers, then re-sort. Used by drag too. */
export const applyGroupOrder = (factories: Factory[], tab: FactoryTab, groups: FactoryGroup[]) => {
  groups.forEach((group, index) => {
    group.order = index
  })
  const byId = new Map(groups.map(group => [group.id, group]))

  for (const factory of factories) {
    if (!factory.group) continue
    const canonical = byId.get(factory.group.id)
    if (canonical) factory.group = cloneGroup(canonical)
  }

  const carried = new Set(factories.map(factory => factory.group?.id).filter(Boolean))
  tab.groups = groups.filter(group => !carried.has(group.id)).map(cloneGroup)

  sortFactoriesByGroup(factories, groups)
}

/**
 * Move one factory into a group (or out of all of them), landing it at `position` within that
 * group. Returns the factories whose stored data changed.
 */
export const moveFactoryToGroup = (
  factories: Factory[],
  tab: FactoryTab,
  factoryId: number,
  groupId: string | null,
  position?: number,
): Factory[] => {
  const factory = factories.find(candidate => candidate.id === factoryId)
  if (!factory) return []

  const groups = collectGroups(factories, tab)
  const target = groupId ? groups.find(group => group.id === groupId) : null
  if (groupId && !target) return []

  factory.group = target ? cloneGroup(target) : undefined

  // Re-seat it inside its new group at the requested slot before the sort runs, since the sort
  // preserves whatever within-group order the array already has.
  const siblings = factoriesInGroup(factories, groupId)
  const withoutSelf = siblings.filter(candidate => candidate.id !== factory.id)
  const slot = Math.max(0, Math.min(position ?? withoutSelf.length, withoutSelf.length))
  const anchor = withoutSelf[slot]

  const currentIndex = factories.indexOf(factory)
  factories.splice(currentIndex, 1)
  const anchorIndex = anchor ? factories.indexOf(anchor) : -1
  factories.splice(anchorIndex === -1 ? factories.length : anchorIndex, 0, factory)

  applyGroupOrder(factories, tab, groups)
  return [factory]
}

/** Reposition a factory inside the group it is already in. */
export const reorderFactoryInGroup = (
  factories: Factory[],
  tab: FactoryTab,
  factoryId: number,
  position: number,
): Factory[] => {
  const factory = factories.find(candidate => candidate.id === factoryId)
  if (!factory) return []
  return moveFactoryToGroup(factories, tab, factoryId, factory.group?.id ?? null, position)
}

/**
 * Delete a group, sending its factories to `reassignTo` (null = Ungrouped). Never deletes a
 * factory — the caller is expected to have asked where they should go.
 */
export const deleteGroup = (
  factories: Factory[],
  tab: FactoryTab,
  groupId: string,
  reassignTo: string | null = null,
): Factory[] => {
  const groups = collectGroups(factories, tab).filter(group => group.id !== groupId)
  const target = reassignTo ? groups.find(group => group.id === reassignTo) ?? null : null
  const touched: Factory[] = []

  for (const factory of factories) {
    if (factory.group?.id !== groupId) continue
    factory.group = target ? cloneGroup(target) : undefined
    touched.push(factory)
  }

  applyGroupOrder(factories, tab, groups)
  return touched
}

/**
 * Load-time repair, wired into validateFactories.
 *
 * Only has to converge disagreeing copies of one id, because a group id on a factory is real by
 * definition under this model — there is no dangling reference to clear. Takes factories alone,
 * so it drops into validateFactories' existing (factories, gameData) signature untouched.
 */
export const repairFactoryGroups = (factories: Factory[]): void => {
  const canonical = new Map<string, FactoryGroup>()

  for (const factory of factories) {
    if (!factory.group) continue
    if (!canonical.has(factory.group.id)) {
      canonical.set(factory.group.id, cloneGroup(factory.group))
    }
  }

  const ordered = [...canonical.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
  ordered.forEach((group, index) => {
    group.order = index
  })

  for (const factory of factories) {
    if (!factory.group) continue
    factory.group = cloneGroup(canonical.get(factory.group.id)!)
  }

  sortFactoriesByGroup(factories, ordered)
}
