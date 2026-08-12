import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/vue'

// <game-asset> reads the game data store outright and throws when it is empty, and
// createTestingPinia stubs the real store's getters away. Same shape as PlannerSidebarGroup.spec.
// vi.hoisted because vi.mock is lifted above ordinary module-scope consts.
/* eslint-disable @typescript-eslint/no-require-imports -- vi.hoisted runs before imports */
const gameData = vi.hoisted(() => {
  const fs = require('node:fs') as typeof import('node:fs')
  const nodePath = require('node:path') as typeof import('node:path')
  const root = nodePath.resolve(__dirname, '../../../..')
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

// The plan itself is the composable's business and has its own specs; this one is about what the
// dialog draws and which calls its controls make.
// Real refs, not `{ value }` stand-ins: the template reads `groups.length` off the unwrapped ref,
// which a plain object silently answers `undefined` to — and an undefined length disables nothing.
/* eslint-disable @typescript-eslint/no-require-imports -- vi.hoisted runs before imports */
const groupsApi = vi.hoisted(() => {
  const { ref } = require('vue') as typeof import('vue')
  return {
    groups: ref([] as any[]),
    sections: ref([] as any[]),
    moveFactoriesToGroup: vi.fn(() => []),
    reorderGroup: vi.fn(),
  }
})
/* eslint-enable @typescript-eslint/no-require-imports */
vi.mock('@/composables/useFactoryGroups', () => ({ useFactoryGroups: () => groupsApi }))

import FactoryGroupBulkDialog from './FactoryGroupBulkDialog.vue'
import { vuetifyRender } from '@/utils/ui-test-bootstrap'
import { Factory, FactoryGroup } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'

const group = (id: string, name: string, order: number): FactoryGroup =>
  ({ id, name, color: '#4caf50', order })

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

// v-dialog teleports to the document body, so everything is read from there.
const body = () => document.body
const heads = () => [...body().querySelectorAll<HTMLElement>('.section-head')]
const rows = () => [...body().querySelectorAll<HTMLElement>('.factory-row')]
const tooltipsIn = (element: Element | null | undefined, selector = '[data-hover-tooltip]') =>
  [...(element?.querySelectorAll(selector) ?? [])]
    .map(node => node.getAttribute('data-hover-tooltip'))
const rowFor = (name: string) => rows().find(row => row.textContent?.includes(name))
const arrowsIn = (head: HTMLElement) =>
  [...head.querySelectorAll('button')].filter(button => button.title.startsWith('Move group'))

const open = () => vuetifyRender(FactoryGroupBulkDialog, { props: { modelValue: true } })

describe('FactoryGroupBulkDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    groupsApi.reorderGroup.mockClear()
    groupsApi.groups.value = [group('g1', 'Copper', 0), group('g2', 'Nuclear', 1)]
    groupsApi.sections.value = [
      {
        group: null,
        factories: [
          withProducts('Oil Processing', 1, ['LiquidOil', 'Plastic']),
          withProducts('Alien Power', 2, []),
        ],
      },
      {
        group: groupsApi.groups.value[0],
        factories: [
          withProducts('Copper Ingots', 3, ['CopperIngot']),
          withProducts('Copper Basics', 4, ['Wire', 'Cable']),
        ],
      },
      {
        group: groupsApi.groups.value[1],
        factories: [withProducts('Uranium Power', 5, ['UraniumCell'])],
      },
    ]
  })

  describe('products', () => {
    it('names what each factory makes, beside the factory', () => {
      open()

      expect(tooltipsIn(rowFor('Oil Processing'), '.product-strip [data-hover-tooltip]'))
        .toEqual(['Crude Oil', 'Plastic'])
      expect(tooltipsIn(rowFor('Copper Basics'), '.product-strip [data-hover-tooltip]'))
        .toEqual(['Wire', 'Cable'])
    })

    it('draws no strip for a factory that produces nothing', () => {
      open()

      expect(rowFor('Alien Power')!.querySelector('.product-strip')).toBeNull()
    })

    it('caps a long list and names the rest in the overflow', () => {
      groupsApi.sections.value[0].factories = [
        withProducts('Everything', 9, [
          'IronIngot', 'IronPlate', 'IronRod', 'Screw', 'Wire', 'Cable', 'Concrete',
        ]),
      ]
      open()

      const row = rowFor('Everything')!
      // Five icons and a +2, not six and a +1: the overflow tile takes a slot of its own.
      expect(tooltipsIn(row, '.product-strip [data-hover-tooltip]')).toHaveLength(5)
      expect(row.querySelector('.overflow-count')?.textContent).toBe('+2')
    })

    it('rolls the whole group up on its header, deduped', () => {
      groupsApi.sections.value[1].factories = [
        withProducts('Copper Ingots', 3, ['CopperIngot']),
        withProducts('Copper Basics', 4, ['CopperIngot', 'Wire']),
      ]
      open()

      expect(tooltipsIn(heads()[1])).toEqual(['Copper Ingot', 'Wire'])
    })
  })

  describe('reordering', () => {
    it('moves a group with the arrows', async () => {
      open()

      await fireEvent.click(arrowsIn(heads()[1])[1])
      expect(groupsApi.reorderGroup).toHaveBeenCalledWith('g1', 'down')

      await fireEvent.click(arrowsIn(heads()[2])[0])
      expect(groupsApi.reorderGroup).toHaveBeenCalledWith('g2', 'up')
    })

    it('disables the arrow at each end of the order', () => {
      open()

      expect(arrowsIn(heads()[1]).map(button => button.disabled)).toEqual([true, false])
      expect(arrowsIn(heads()[2]).map(button => button.disabled)).toEqual([false, true])
    })

    it('gives Ungrouped no arrows, since it is pinned to the top', () => {
      open()

      expect(arrowsIn(heads()[0])).toHaveLength(0)
    })
  })
})
