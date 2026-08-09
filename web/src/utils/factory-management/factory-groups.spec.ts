import { beforeEach, describe, expect, it } from 'vitest'
import { Factory, FactoryGroup, FactoryTab } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import {
  applyGroupOrder,
  collectGroups,
  createGroup,
  defaultGroupColor,
  deleteGroup,
  factoriesInGroup,
  groupedFactories,
  moveFactoryToGroup,
  reconcileGroups,
  renameGroup,
  reorderFactoryInGroup,
  reorderGroup,
  repairFactoryGroups,
  setGroupCollapsed,
  sortFactoriesByGroup,
} from '@/utils/factory-management/factory-groups'
import { groupPalette, mixHex, sfColors } from '@/utils/colors'

const group = (id: string, order: number, overrides: Partial<FactoryGroup> = {}): FactoryGroup => ({
  id,
  name: id.toUpperCase(),
  color: '#4caf50',
  order,
  collapsed: false,
  ...overrides,
})

// The invariant every mutation has to leave true.
const expectInvariant = (factories: Factory[], tab?: FactoryTab) => {
  const groups = collectGroups(factories, tab)
  const rank = (factory: Factory) =>
    factory.group ? groups.findIndex(candidate => candidate.id === factory.group!.id) : -1

  // displayOrder is dense and index-aligned.
  expect(factories.map(factory => factory.displayOrder)).toEqual(factories.map((_, index) => index))

  // Group ranks never decrease: contiguous, in group order, Ungrouped (-1) first.
  const ranks = factories.map(rank)
  expect([...ranks].sort((a, b) => a - b)).toEqual(ranks)
}

describe('factory-groups', () => {
  let tab: FactoryTab
  let factories: Factory[]

  beforeEach(() => {
    factories = [
      newFactory('Alpha', 0, 1),
      newFactory('Bravo', 1, 2),
      newFactory('Charlie', 2, 3),
      newFactory('Delta', 3, 4),
    ]
    tab = { id: 'tab', name: 'Plan', factories }
  })

  describe('the ordering invariant', () => {
    it('puts ungrouped factories first and keeps groups contiguous', () => {
      const groups = [group('g1', 0), group('g2', 1)]
      factories[0].group = { ...groups[1] } // Alpha in the second group
      factories[2].group = { ...groups[0] } // Charlie in the first

      sortFactoriesByGroup(factories, groups)

      expect(factories.map(factory => factory.name)).toEqual(['Bravo', 'Delta', 'Charlie', 'Alpha'])
      expectInvariant(factories)
    })

    it('preserves the order within a group', () => {
      const groups = [group('g1', 0)]
      factories.forEach(factory => {
        factory.group = { ...groups[0] }
      })

      sortFactoriesByGroup(factories, groups)

      expect(factories.map(factory => factory.name)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta'])
    })

    it.each([
      ['creating a group', (t: FactoryTab, f: Factory[]) => createGroup(f, t, 'New')],
      ['moving into a group', (t: FactoryTab, f: Factory[]) => {
        const created = createGroup(f, t, 'New')
        moveFactoryToGroup(f, t, f[2].id, created.id)
      }],
      ['moving back out', (t: FactoryTab, f: Factory[]) => {
        const created = createGroup(f, t, 'New')
        moveFactoryToGroup(f, t, f[2].id, created.id)
        moveFactoryToGroup(f, t, f.find(x => x.group)!.id, null)
      }],
      ['deleting a populated group', (t: FactoryTab, f: Factory[]) => {
        const created = createGroup(f, t, 'New')
        moveFactoryToGroup(f, t, f[1].id, created.id)
        deleteGroup(f, t, created.id, null)
      }],
      ['reordering groups', (t: FactoryTab, f: Factory[]) => {
        const a = createGroup(f, t, 'A')
        const b = createGroup(f, t, 'B')
        moveFactoryToGroup(f, t, f[0].id, a.id)
        moveFactoryToGroup(f, t, f[1].id, b.id)
        reorderGroup(f, t, b.id, 'up')
      }],
      ['reordering within a group', (t: FactoryTab, f: Factory[]) => {
        const a = createGroup(f, t, 'A')
        moveFactoryToGroup(f, t, f[0].id, a.id)
        moveFactoryToGroup(f, t, f[1].id, a.id)
        reorderFactoryInGroup(f, t, f.find(x => x.group)!.id, 1)
      }],
    ])('holds after %s', (_label, mutate) => {
      mutate(tab, factories)
      expectInvariant(factories, tab)
    })
  })

  describe('reconciliation', () => {
    // The cloud-restore case: the save payload is a bare Factory[], so the tab arrives with no
    // registry at all and the entire group set has to come back off the factories.
    it('rebuilds every group from the factories alone', () => {
      const restored = [newFactory('Alpha', 0, 1), newFactory('Bravo', 1, 2)]
      restored[0].group = group('g1', 0, { name: 'Aluminium', color: '#26a69a' })
      restored[1].group = group('g2', 1, { name: 'Steel' })
      const freshTab: FactoryTab = { id: 't', name: 'Restored', factories: restored }

      const groups = reconcileGroups(restored, freshTab)

      expect(groups.map(entry => entry.name)).toEqual(['Aluminium', 'Steel'])
      expect(restored[0].group?.color).toBe('#26a69a')
    })

    it('keeps a group that has no factory to carry it', () => {
      const empty = createGroup(factories, tab, 'Empty')

      reconcileGroups(factories, tab)

      expect(tab.groups?.map(entry => entry.id)).toContain(empty.id)
      expect(collectGroups(factories, tab).map(entry => entry.name)).toContain('Empty')
    })

    it('drops a group from the registry once a factory carries it', () => {
      const created = createGroup(factories, tab, 'Aluminium')
      moveFactoryToGroup(factories, tab, factories[0].id, created.id)

      reconcileGroups(factories, tab)

      expect(tab.groups?.map(entry => entry.id)).not.toContain(created.id)
      expect(collectGroups(factories, tab)).toHaveLength(1)
    })

    it('converges copies of one group that disagree', () => {
      factories[0].group = group('g1', 0, { name: 'Correct' })
      factories[1].group = group('g1', 0, { name: 'Stale' })

      reconcileGroups(factories, tab)

      expect(factories[0].group?.name).toBe('Correct')
      expect(factories[1].group?.name).toBe('Correct')
    })

    it('renumbers group order densely', () => {
      factories[0].group = group('g1', 17)
      factories[1].group = group('g2', 42)

      const groups = reconcileGroups(factories, tab)

      expect(groups.map(entry => entry.order)).toEqual([0, 1])
    })
  })

  describe('groupedFactories', () => {
    it('omits Ungrouped when everything is in a group', () => {
      const created = createGroup(factories, tab, 'All')
      // Snapshot the ids first: the mutators reorder the array in place, so iterating it
      // while moving skips entries.
      const ids = factories.map(factory => factory.id)
      ids.forEach(id => moveFactoryToGroup(factories, tab, id, created.id))

      const sections = groupedFactories(factories, tab)

      expect(sections).toHaveLength(1)
      expect(sections[0].group?.name).toBe('All')
    })

    it('leads with Ungrouped when anything is loose', () => {
      const created = createGroup(factories, tab, 'Some')
      moveFactoryToGroup(factories, tab, factories[0].id, created.id)

      const sections = groupedFactories(factories, tab)

      expect(sections[0].group).toBeNull()
      expect(sections[1].group?.name).toBe('Some')
    })

    // Without this a group created before anything is put in it cannot render, be dropped
    // into, or be deleted.
    it('includes a group with no factories', () => {
      createGroup(factories, tab, 'Empty')

      const sections = groupedFactories(factories, tab)

      expect(sections.find(section => section.group?.name === 'Empty')?.factories).toEqual([])
    })

    it('has no plan-shaped effect when no group was ever made', () => {
      const sections = groupedFactories(factories, tab)

      expect(sections).toHaveLength(1)
      expect(sections[0].group).toBeNull()
      expect(sections[0].factories).toHaveLength(4)
    })
  })

  describe('mutations fan out to every member', () => {
    it('renames on all of them', () => {
      const created = createGroup(factories, tab, 'Old')
      moveFactoryToGroup(factories, tab, factories[0].id, created.id)
      moveFactoryToGroup(factories, tab, factories[1].id, created.id)

      const touched = renameGroup(factories, tab, created.id, 'New')

      expect(touched).toHaveLength(2)
      expect(factoriesInGroup(factories, created.id).map(f => f.group?.name)).toEqual(['New', 'New'])
    })

    it('collapses on all of them, so the state travels with the plan', () => {
      const created = createGroup(factories, tab, 'Group')
      moveFactoryToGroup(factories, tab, factories[0].id, created.id)

      setGroupCollapsed(factories, tab, created.id, true)

      expect(factoriesInGroup(factories, created.id)[0].group?.collapsed).toBe(true)
    })

    it('sends a deleted group\'s factories where it is told, never deleting one', () => {
      const from = createGroup(factories, tab, 'From')
      const to = createGroup(factories, tab, 'To')
      moveFactoryToGroup(factories, tab, factories[0].id, from.id)
      moveFactoryToGroup(factories, tab, factories[1].id, from.id)

      deleteGroup(factories, tab, from.id, to.id)

      expect(factories).toHaveLength(4)
      expect(factoriesInGroup(factories, to.id)).toHaveLength(2)
      expect(collectGroups(factories, tab).map(entry => entry.id)).not.toContain(from.id)
    })

    it('sends them to Ungrouped when asked', () => {
      const from = createGroup(factories, tab, 'From')
      moveFactoryToGroup(factories, tab, factories[0].id, from.id)

      deleteGroup(factories, tab, from.id, null)

      expect(factories.every(factory => !factory.group)).toBe(true)
    })

    it('lands a factory at the requested slot within its group', () => {
      const created = createGroup(factories, tab, 'Group')
      moveFactoryToGroup(factories, tab, factories[0].id, created.id) // Alpha
      moveFactoryToGroup(factories, tab, factories.find(f => f.name === 'Bravo')!.id, created.id)
      moveFactoryToGroup(factories, tab, factories.find(f => f.name === 'Charlie')!.id, created.id, 0)

      expect(factoriesInGroup(factories, created.id).map(f => f.name)).toEqual(['Charlie', 'Alpha', 'Bravo'])
    })

    it('ignores a move to a group that does not exist', () => {
      const before = factories.map(factory => factory.name)
      moveFactoryToGroup(factories, tab, factories[0].id, 'nope')
      expect(factories.map(factory => factory.name)).toEqual(before)
      expect(factories[0].group).toBeUndefined()
    })
  })

  describe('reorderGroup', () => {
    it('moves a group and its factories together', () => {
      const a = createGroup(factories, tab, 'A')
      const b = createGroup(factories, tab, 'B')
      moveFactoryToGroup(factories, tab, factories.find(f => f.name === 'Alpha')!.id, a.id)
      moveFactoryToGroup(factories, tab, factories.find(f => f.name === 'Bravo')!.id, b.id)

      reorderGroup(factories, tab, b.id, 'up')

      const sections = groupedFactories(factories, tab)
      expect(sections.map(section => section.group?.name ?? 'Ungrouped')).toEqual(['Ungrouped', 'B', 'A'])
      expectInvariant(factories, tab)
    })

    it('is a no-op at the ends', () => {
      const a = createGroup(factories, tab, 'A')
      moveFactoryToGroup(factories, tab, factories[0].id, a.id)

      reorderGroup(factories, tab, a.id, 'up')

      expect(collectGroups(factories, tab)[0].id).toBe(a.id)
    })
  })

  describe('repairFactoryGroups', () => {
    it('converges disagreeing copies and re-sorts, with no tab in hand', () => {
      const loaded = [
        newFactory('Alpha', 0, 1),
        newFactory('Bravo', 1, 2),
        newFactory('Charlie', 2, 3),
      ]
      loaded[0].group = group('g1', 5, { name: 'Right' })
      loaded[2].group = group('g1', 5, { name: 'Wrong' })

      repairFactoryGroups(loaded)

      expect(loaded.map(f => f.name)).toEqual(['Bravo', 'Alpha', 'Charlie'])
      expect(loaded[2].group?.name).toBe('Right')
      expectInvariant(loaded)
    })

    it('leaves an ungrouped plan alone', () => {
      const loaded = [newFactory('Alpha', 0, 1), newFactory('Bravo', 1, 2)]
      repairFactoryGroups(loaded)
      expect(loaded.map(f => f.name)).toEqual(['Alpha', 'Bravo'])
    })
  })

  describe('colour', () => {
    it('never offers a status colour as a group colour', () => {
      const offered = groupPalette.map(entry => entry.value.toLowerCase())

      expect(offered).not.toContain(sfColors.problem.color.toLowerCase())
      expect(offered).not.toContain(sfColors.statusWarning.color.toLowerCase())
      // The amber and yellow families too — a group must never read as a warning.
      expect(offered).not.toContain('#f57f17')
      expect(offered).not.toContain('#fbc02d')
    })

    it('hands out a different colour to each new group while it can', () => {
      const first = createGroup(factories, tab, 'A')
      const second = createGroup(factories, tab, 'B')
      expect(second.color).not.toBe(first.color)
    })

    it('falls back to the first palette entry once they are all used', () => {
      const used = groupPalette.map((entry, index) => group(`g${index}`, index, { color: entry.value }))
      expect(defaultGroupColor(used)).toBe(groupPalette[0].value)
    })

    it('mixes to an opaque colour, darker than the source', () => {
      const muted = mixHex('#4caf50', 0.22)
      expect(muted).toMatch(/^#[0-9a-f]{6}$/)
      expect(muted).not.toBe('#4caf50')
      // Blended toward the dark card surface, so every channel drops.
      expect(parseInt(muted.slice(1, 3), 16)).toBeLessThan(0x4c)
    })
  })

  describe('applyGroupOrder', () => {
    it('writes an explicit order to both carriers', () => {
      const a = createGroup(factories, tab, 'A')
      const b = createGroup(factories, tab, 'B')
      moveFactoryToGroup(factories, tab, factories[0].id, a.id)

      applyGroupOrder(factories, tab, [
        { ...b, order: 0 },
        { ...a, order: 1 },
      ])

      expect(collectGroups(factories, tab).map(entry => entry.name)).toEqual(['B', 'A'])
      expect(factoriesInGroup(factories, a.id)[0].group?.order).toBe(1)
      expectInvariant(factories, tab)
    })
  })
})
