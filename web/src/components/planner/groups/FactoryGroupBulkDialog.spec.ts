import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
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
    renameGroup: vi.fn(),
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
const pencilIn = (head: HTMLElement) =>
  [...head.querySelectorAll('button')].find(button => button.title === 'Rename group')
const nameField = () => body().querySelector<HTMLInputElement>('.group-name-input')

const open = () => vuetifyRender(FactoryGroupBulkDialog, { props: { modelValue: true } })

// The app's test bootstrap installs a ResizeObserver that never fires, which is honest for a DOM
// that never lays anything out — but it leaves the icon counts permanently on their unmeasured
// fallback. This one keeps its callback so `widen` can report a size to it by hand.
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

const widen = async (width: number) => {
  // The observer is armed by a post-flush watch, so it does not exist yet on the tick a render
  // returns on.
  await nextTick()
  const [element, callback] = [...observed][0] ?? []
  if (!element) throw new Error('nothing is being measured')
  callback!([{ target: element, contentRect: { width } } as unknown as ResizeObserverEntry], {} as ResizeObserver)
  await nextTick()
}

describe('FactoryGroupBulkDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    groupsApi.reorderGroup.mockClear()
    groupsApi.renameGroup.mockClear()
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

    it('fills the width it is given, and names the rest in the overflow', async () => {
      groupsApi.sections.value[0].factories = [
        withProducts('Everything', 9, [
          'IronIngot', 'IronPlate', 'IronRod', 'Screw', 'Wire', 'Cable', 'Concrete',
        ]),
      ]
      open()
      await widen(720)

      // Everything fits at the dialog's own width, so nothing is hidden.
      expect(tooltipsIn(rowFor('Everything'), '.product-strip [data-hover-tooltip]')).toHaveLength(7)
      expect(rowFor('Everything')!.querySelector('.overflow-count')).toBeNull()
    })

    it('drops icons rather than squeezing the names when there is no room', async () => {
      groupsApi.sections.value[0].factories = [
        withProducts('Everything', 9, [
          'IronIngot', 'IronPlate', 'IronRod', 'Screw', 'Wire', 'Cable', 'Concrete',
        ]),
      ]
      open()
      await widen(400)

      const row = rowFor('Everything')!
      // Three icons and a +4, not four and a +3: the overflow tile takes a slot of its own.
      expect(tooltipsIn(row, '.product-strip [data-hover-tooltip]')).toHaveLength(3)
      expect(row.querySelector('.overflow-count')?.textContent).toBe('+4')
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

  describe('renaming', () => {
    it('opens the name for editing from the pencil, ready to be typed over', async () => {
      open()

      await fireEvent.click(pencilIn(heads()[1])!)
      await nextTick()

      expect(nameField()?.value).toBe('Copper')
    })

    it('opens it from the name itself too', async () => {
      open()

      await fireEvent.click(heads()[1].querySelector('.group-name')!)
      await nextTick()

      expect(nameField()).not.toBeNull()
    })

    it('applies on Enter, without waiting for a click elsewhere', async () => {
      open()
      await fireEvent.click(pencilIn(heads()[1])!)
      await nextTick()

      await fireEvent.update(nameField()!, 'Copper Chain')
      await fireEvent.keyUp(nameField()!, { key: 'Enter' })

      expect(groupsApi.renameGroup).toHaveBeenCalledWith('g1', 'Copper Chain')
      // And it goes back to being a label, so nothing is left looking half-edited.
      expect(nameField()).toBeNull()
    })

    it('renames once when Enter is followed by the blur it causes', async () => {
      open()
      await fireEvent.click(pencilIn(heads()[1])!)
      await nextTick()

      await fireEvent.update(nameField()!, 'Copper Chain')
      const field = nameField()!
      await fireEvent.keyUp(field, { key: 'Enter' })
      await fireEvent.blur(field)

      expect(groupsApi.renameGroup).toHaveBeenCalledTimes(1)
    })

    it('discards the edit on Escape', async () => {
      open()
      await fireEvent.click(pencilIn(heads()[1])!)
      await nextTick()

      await fireEvent.update(nameField()!, 'Discarded')
      await fireEvent.keyDown(nameField()!, { key: 'Escape' })

      expect(groupsApi.renameGroup).not.toHaveBeenCalled()
    })

    it('offers no rename on Ungrouped, which is not a group', () => {
      open()

      expect(pencilIn(heads()[0])).toBeUndefined()
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
