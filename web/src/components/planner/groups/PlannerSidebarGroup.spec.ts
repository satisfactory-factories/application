import { describe, expect, it, vi } from 'vitest'
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

const group = (overrides: Partial<FactoryGroup> = {}): FactoryGroup => ({
  id: 'g1',
  name: 'Aluminium',
  color: '#4caf50',
  order: 0,
  collapsed: false,
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

const renderGroup = (section: FactoryGroupSection, ungroupedCollapsed = false) =>
  vuetifyRender(PlannerSidebarGroup, {
    props: { section, statuses: new Map(), ungroupedCollapsed },
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

    it('caps the icons and counts the rest', () => {
      // Real part keys: an unrecognised id renders a question-mark glyph, not an <img>.
      const products = Object.keys(gameData.items.parts).slice(0, 12)
      const { container } = renderGroup({
        group: group(),
        factories: [withProducts('Alpha', 1, products)],
      })

      expect(container.querySelectorAll('.group-header img')).toHaveLength(8)
      expect(container.querySelector('.overflow-count')?.textContent).toBe('+4')
    })
  })

  describe('the drop strip', () => {
    // Sortable needs a target with real geometry. Without the strip these two states are zero
    // pixels tall and cannot be dragged into at all.
    it('appears when the group is collapsed', () => {
      const { container } = renderGroup({
        group: group({ collapsed: true }),
        factories: [withProducts('Alpha', 1, [])],
      })

      expect(container.querySelector('.drop-strip')?.textContent).toContain('Aluminium')
    })

    it('appears when the group is expanded but empty', () => {
      const { container } = renderGroup({ group: group(), factories: [] })

      expect(container.querySelector('.drop-strip')?.textContent).toContain('Drop a factory here')
    })

    it('stays out of the way when there are rows to aim at', () => {
      const { container } = renderGroup({
        group: group(),
        factories: [withProducts('Alpha', 1, [])],
      })

      expect(container.querySelector('.drop-strip')).toBeNull()
    })
  })

  describe('collapse', () => {
    it('hides the rows when collapsed', () => {
      const open = renderGroup({ group: group(), factories: [withProducts('Alpha', 1, [])] })
      const shut = renderGroup({ group: group({ collapsed: true }), factories: [withProducts('Alpha', 1, [])] })

      expect(open.container.querySelectorAll('.group-body .factory-card')).toHaveLength(1)
      expect(shut.container.querySelectorAll('.group-body .factory-card')).toHaveLength(0)
    })

    it('asks the list to toggle Ungrouped, which has nowhere of its own to store it', async () => {
      const { container, emitted } = renderGroup({ group: null, factories: [] })

      await fireEvent.click(container.querySelector('.chevron')!)

      expect(emitted()['toggle-ungrouped']).toHaveLength(1)
    })
  })

  it('asks the list to delete, rather than deleting behind its back', async () => {
    const target = group()
    const { container, emitted } = renderGroup({ group: target, factories: [] })

    await fireEvent.click(container.querySelector('.delete-group')!)

    expect(emitted().delete?.[0]).toEqual([target])
  })
})
