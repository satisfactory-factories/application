import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { fireEvent } from '@testing-library/vue'
import PlannerSidebarGroup from './PlannerSidebarGroup.vue'

// The product line renders <game-asset>, which throws outright when the store has no data —
// and createTestingPinia stubs the store's getters away. Same shape as router/index.spec.ts.
// vi.hoisted because vi.mock is lifted above ordinary module-scope consts.
/* eslint-disable @typescript-eslint/no-require-imports -- vi.hoisted runs before imports */
const gameData = vi.hoisted(() => {
  const fs = require('node:fs') as typeof import('node:fs')
  const nodePath = require('node:path') as typeof import('node:path')
  const root = nodePath.resolve(__dirname, '../../../..')
  // Read the version rather than hardcoding it, so a data bump does not silently break this.
  const version = fs.readFileSync(nodePath.join(root, 'src/config/config.ts'), 'utf-8')
    .match(/dataVersion:\s*'([^']+)'/)![1]
  return JSON.parse(fs.readFileSync(nodePath.join(root, `public/gameData_v${version}.json`), 'utf-8'))
})
/* eslint-enable @typescript-eslint/no-require-imports */
vi.mock('@/stores/game-data-store', () => ({
  useGameDataStore: () => ({
    getGameData: () => gameData,
    loadGameData: async () => {},
  }),
}))
import { vuetifyRender } from '@/utils/ui-test-bootstrap'
import { Factory, FactoryGroup } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { FactoryGroupSection } from '@/utils/factory-management/factory-groups'
import { useGroupCollapse } from '@/composables/useGroupCollapse'
import { useFactoryDrag } from '@/composables/useFactoryDrag'

const group = (overrides: Partial<FactoryGroup> = {}): FactoryGroup => ({
  id: 'g1',
  name: 'Aluminium',
  color: '#4caf50',
  order: 0,
  ...overrides,
})

const withProducts = (name: string, id: number, productIds: string[]): Factory => {
  const factory = newFactory(name, id - 1, id)
  factory.products = productIds.map((productId, index) => ({
    id: productId,
    recipe: productId,
    amount: 10,
    displayOrder: index,
    requirements: {},
    buildingRequirements: { name: 'constructormk1', amount: 1 },
    buildingGroups: [],
    buildingGroupsTrayOpen: false,
    buildingGroupsHaveProblem: false,
    buildingGroupItemSync: true,
  }))
  return factory
}

const renderGroup = (section: FactoryGroupSection) =>
  vuetifyRender(PlannerSidebarGroup, {
    props: { section, statuses: new Map() },
  })

// The app's test bootstrap installs a ResizeObserver that never fires, which is honest for a DOM
// that never lays anything out. The product line is laid out against a measured width, so this
// one keeps its callback and `resizeTo` reports a size to it by hand.
const observed = new Map<Element, ResizeObserverCallback>()
class RecordingResizeObserver implements ResizeObserver {
  callback: ResizeObserverCallback
  constructor (callback: ResizeObserverCallback) {
    this.callback = callback
  }

  observe (element: Element) {
    observed.set(element, this.callback)
  }

  unobserve (element: Element) {
    observed.delete(element)
  }

  disconnect () {
    for (const [element, callback] of observed) {
      if (callback === this.callback) observed.delete(element)
    }
  }
}
vi.stubGlobal('ResizeObserver', RecordingResizeObserver)

const resizeTo = async (element: Element, width: number) => {
  // The observer is armed by a post-flush watch, so it does not exist yet on the tick a render
  // returns on.
  await nextTick()
  const entry = { target: element, contentRect: { width } } as unknown as ResizeObserverEntry
  observed.get(element)?.([entry], {} as ResizeObserver)
  await nextTick()
}

// Collapse is view state shared at module scope, so it has to be reset between tests or one
// collapsed group leaks into every case after it.
const { isCollapsed, setCollapsed, usePlan } = useGroupCollapse()
// Collapse state is namespaced per plan, so one has to be on screen before any of it applies.
usePlan('spec-plan')
const { draggingFactory } = useFactoryDrag()
afterEach(() => {
  setCollapsed('g1', false)
  setCollapsed(null, false)
  draggingFactory.value = false
  localStorage.clear()
})

describe('PlannerSidebarGroup', () => {
  it('shows the group name and its factory count', () => {
    const { container } = renderGroup({
      group: group(),
      factories: [withProducts('Alpha', 1, ['IronIngot']), withProducts('Bravo', 2, ['Wire'])],
    })

    expect(container.querySelector<HTMLInputElement>('.group-name')?.value).toBe('Aluminium')
    expect(container.textContent).toContain('2')
  })

  it('labels the synthesised section Ungrouped, with nothing to rename or delete', () => {
    const { container } = renderGroup({ group: null, factories: [withProducts('Alpha', 1, [])] })

    expect(container.querySelector('.ungrouped-label')?.textContent).toBe('Ungrouped')
    expect(container.querySelector('input.group-name')).toBeNull()
    expect(container.querySelector('.delete-group')).toBeNull()
    expect(container.querySelector('.group-drag-handle')).toBeNull()
  })

  it('paints itself in the group colour', () => {
    const { container } = renderGroup({ group: group({ color: '#2196f3' }), factories: [] })

    const style = container.querySelector<HTMLElement>('.sidebar-group')?.getAttribute('style')
    expect(style).toContain('--sf-group: #2196f3')
    expect(style).toContain('--sf-group-muted')
  })

  describe('the product line', () => {
    it('dedupes what the group makes across its factories', () => {
      const { container } = renderGroup({
        group: group(),
        factories: [
          withProducts('Alpha', 1, ['IronIngot', 'Wire']),
          withProducts('Bravo', 2, ['Wire', 'Cable']),
        ],
      })

      expect(container.querySelectorAll('.group-header img')).toHaveLength(3)
      expect(container.querySelector('.overflow-count')).toBeNull()
    })

    it('caps the icons and counts the rest before the row has been measured', () => {
      // Real part keys: an unrecognised id renders a question-mark glyph, not an <img>.
      const products = Object.keys(gameData.items.parts).slice(0, 12)
      const { container } = renderGroup({
        group: group(),
        factories: [withProducts('Alpha', 1, products)],
      })

      // Seven icons and the +N tile: the count occupies a slot of its own, so eight of each
      // would be nine tiles in eight slots — which is what used to wrap the row.
      expect(container.querySelectorAll('.group-header img')).toHaveLength(7)
      expect(container.querySelector('.overflow-count')?.textContent).toBe('+5')
    })

    // jsdom does no layout, so the width the component lays out against is fed in by hand —
    // which is also the only way to drive a resize without a real browser.
    it.each([
      // width, icons, count. A 36px tile with a 4px gap: n tiles need n * 40 - 4.
      [436, 10, '+2'], // 11 slots, so ten icons and the count
      [396, 9, '+3'], // 10 slots
      [156, 3, '+9'], // 4 slots
      [76, 1, '+11'], // 2 slots
      [36, 0, '+12'], // 1 slot, and the count wins it
    ])('fits the icons to a %ipx row', async (width, icons, count) => {
      const products = Object.keys(gameData.items.parts).slice(0, 12)
      const { container } = renderGroup({
        group: group(),
        factories: [withProducts('Alpha', 1, products)],
      })

      await resizeTo(container.querySelector('.product-row')!, width)

      expect(container.querySelectorAll('.group-header img')).toHaveLength(icons)
      expect(container.querySelector('.overflow-count')?.textContent).toBe(count)
    })

    it('drops the count entirely once everything fits', async () => {
      const products = Object.keys(gameData.items.parts).slice(0, 12)
      const { container } = renderGroup({
        group: group(),
        factories: [withProducts('Alpha', 1, products)],
      })

      await resizeTo(container.querySelector('.product-row')!, 476) // 12 slots, 12 products

      expect(container.querySelectorAll('.group-header img')).toHaveLength(12)
      expect(container.querySelector('.overflow-count')).toBeNull()
    })

    it('keeps the last measured width when the sidebar is hidden', async () => {
      const products = Object.keys(gameData.items.parts).slice(0, 12)
      const { container } = renderGroup({
        group: group(),
        factories: [withProducts('Alpha', 1, products)],
      })
      const row = container.querySelector('.product-row')!

      await resizeTo(row, 156)
      await resizeTo(row, 0) // display: none reports zero for everything inside it

      expect(container.querySelectorAll('.group-header img')).toHaveLength(3)
      expect(container.querySelector('.overflow-count')?.textContent).toBe('+9')
    })
  })

  describe('the drop strip', () => {
    // Sortable needs a target with real geometry, and these two states are otherwise zero pixels
    // tall — but only while something is actually being dragged, or it is just clutter under every
    // shut group.
    it('appears when the group is collapsed and a factory is in the air', () => {
      setCollapsed('g1', true)
      draggingFactory.value = true
      const { container } = renderGroup({
        group: group(),
        factories: [withProducts('Alpha', 1, [])],
      })

      expect(container.querySelector('.drop-strip')?.textContent).toContain('Aluminium')
    })

    it('appears when the group is empty and a factory is in the air', () => {
      draggingFactory.value = true
      const { container } = renderGroup({ group: group(), factories: [] })

      expect(container.querySelector('.drop-strip')?.textContent).toContain('Drop a factory here')
    })

    it('stays out of the way when nothing is being dragged', () => {
      setCollapsed('g1', true)
      const { container } = renderGroup({ group: group(), factories: [] })

      expect(container.querySelector('.drop-strip')).toBeNull()
    })

    it('stays out of the way when there are rows to aim at', () => {
      draggingFactory.value = true
      const { container } = renderGroup({
        group: group(),
        factories: [withProducts('Alpha', 1, [])],
      })

      expect(container.querySelector('.drop-strip')).toBeNull()
    })
  })

  describe('collapse', () => {
    // Collapsing marks the body rather than dropping the rows: rebuilding forty of them on every
    // toggle is what made a large group take seconds to open, so CSS hides what is already there.
    it('marks the body collapsed, keeping the rows it has already rendered', async () => {
      const { container } = renderGroup({ group: group(), factories: [withProducts('Alpha', 1, [])] })
      expect(container.querySelector('.group-body.collapsed')).toBeNull()

      await fireEvent.click(container.querySelector('.chevron')!)

      expect(container.querySelector('.group-body.collapsed')).not.toBeNull()
      expect(container.querySelectorAll('.group-body .factory-card')).toHaveLength(1)
    })

    it('toggles Ungrouped too, which has nowhere in the plan of its own to store it', async () => {
      const { container } = renderGroup({ group: null, factories: [] })

      await fireEvent.click(container.querySelector('.chevron')!)

      expect(isCollapsed(null)).toBe(true)
    })
  })

  it('hangs each row off a tree wrapper, so the trunk and elbow miss the row itself', () => {
    const { container } = renderGroup({
      group: group(),
      factories: [withProducts('Alpha', 1, []), withProducts('Bravo', 2, [])],
    })

    expect(container.querySelectorAll('.group-body > .tree-item')).toHaveLength(2)
    expect(container.querySelectorAll('.tree-item > .factory-card')).toHaveLength(2)
  })

  describe('the add factory row', () => {
    // The point of the button: the planner cannot tell which group a plain "new factory" click
    // came from, so the group names itself.
    it('asks for a factory in this group', async () => {
      const { container, emitted } = renderGroup({
        group: group(),
        factories: [withProducts('Alpha', 1, [])],
      })

      await fireEvent.click(container.querySelector('.add-factory-btn')!)

      expect(emitted().createFactory?.[0]).toEqual(['g1'])
    })

    // Ungrouped is a real destination, not the absence of one — the factory belongs to no group.
    it('asks for an ungrouped factory from the synthesised section', async () => {
      const { container, emitted } = renderGroup({ group: null, factories: [] })

      await fireEvent.click(container.querySelector('.add-factory-btn')!)

      expect(emitted().createFactory?.[0]).toEqual([null])
    })

    // An empty group is otherwise nothing but a header, and filling it by dragging a factory in
    // is the only way it had of getting one.
    it('is offered by an empty group', () => {
      const { container } = renderGroup({ group: group(), factories: [] })

      expect(container.querySelector('.add-factory-btn')).not.toBeNull()
    })

    it('is hidden while the group is collapsed, along with the rows it sits under', async () => {
      const { container } = renderGroup({ group: group(), factories: [withProducts('Alpha', 1, [])] })
      expect(container.querySelector('.group-footer.collapsed')).toBeNull()

      await fireEvent.click(container.querySelector('.chevron')!)

      expect(container.querySelector('.group-footer.collapsed')).not.toBeNull()
    })
  })

  it('asks the list to delete, rather than deleting behind its back', async () => {
    const target = group()
    const { container, emitted } = renderGroup({ group: target, factories: [] })

    await fireEvent.click(container.querySelector('.delete-group')!)

    expect(emitted().delete?.[0]).toEqual([target])
  })
})
