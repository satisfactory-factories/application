import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { fireEvent } from '@testing-library/vue'

// <factory-icon-display> reads the game data store outright and throws when it is empty, and
// createTestingPinia stubs the real store's getters away. Same shape as FactoryGroupBulkDialog.spec.
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
/* eslint-disable @typescript-eslint/no-require-imports -- vi.hoisted runs before imports */
const groupsApi = vi.hoisted(() => {
  const { ref } = require('vue') as typeof import('vue')
  return {
    groups: ref([] as any[]),
    sections: ref([] as any[]),
    createGroup: vi.fn(),
    moveFactoryToGroup: vi.fn(),
    reorderGroup: vi.fn(),
    setGroupOrder: vi.fn(),
  }
})
/* eslint-enable @typescript-eslint/no-require-imports */
vi.mock('@/composables/useFactoryGroups', () => ({ useFactoryGroups: () => groupsApi }))

import FactoryArrangeDialog from './FactoryArrangeDialog.vue'
import { vuetifyRender } from '@/utils/ui-test-bootstrap'
import { FactoryGroup } from '@/interfaces/planner/FactoryInterface'
import { newFactory } from '@/utils/factory-management/factory'
import { useFactoryDrag } from '@/composables/useFactoryDrag'

const { dragEnabled } = useFactoryDrag()

const group = (id: string, name: string, order: number): FactoryGroup =>
  ({ id, name, color: '#4caf50', order })

// v-dialog teleports to the document body, so everything is read from there.
const body = () => document.body
const sections = () => [...body().querySelectorAll<HTMLElement>('.arrange-section')]
const sectionFor = (name: string) =>
  sections().find(section => section.querySelector('.section-head')?.textContent?.includes(name))!
const rows = () => [...body().querySelectorAll<HTMLElement>('.factory-row')]
const rowFor = (name: string) => rows().find(row => row.textContent?.includes(name))!
const buttonIn = (element: HTMLElement, selector: string) =>
  element.querySelector<HTMLButtonElement>(`button${selector}, ${selector} button`) ??
    [...element.querySelectorAll<HTMLElement>(selector)][0] as HTMLButtonElement

const open = () => vuetifyRender(FactoryArrangeDialog, { props: { modelValue: true } })

describe('FactoryArrangeDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    dragEnabled.value = true
    groupsApi.moveFactoryToGroup.mockClear()
    groupsApi.reorderGroup.mockClear()
    groupsApi.groups.value = [group('g1', 'Copper', 0), group('g2', 'Nuclear', 1)]
    groupsApi.sections.value = [
      { group: null, factories: [newFactory('Oil Processing', 0, 1)] },
      {
        group: groupsApi.groups.value[0],
        factories: [
          newFactory('Copper Ingots', 1, 2),
          newFactory('Copper Basics', 2, 3),
          newFactory('Copper Sheets', 3, 4),
        ],
      },
      { group: groupsApi.groups.value[1], factories: [] },
    ]
  })

  it('draws Ungrouped first, then every group, whether or not it holds anything', () => {
    open()

    expect(sections().map(section => section.querySelector('.section-head')!.textContent!.trim()))
      .toEqual(expect.arrayContaining([
        expect.stringContaining('Ungrouped'),
        expect.stringContaining('Copper'),
        expect.stringContaining('Nuclear'),
      ]))
    expect(sectionFor('Nuclear').textContent).toContain('Nothing filed here yet')
  })

  describe('group order', () => {
    it('moves a group with its arrows', async () => {
      open()

      await fireEvent.click(buttonIn(sectionFor('Nuclear'), '.group-up')!)

      expect(groupsApi.reorderGroup).toHaveBeenCalledWith('g2', 'up')
    })

    it('has nothing to move past at either end', () => {
      open()

      expect(buttonIn(sectionFor('Copper'), '.group-up')!.disabled).toBe(true)
      expect(buttonIn(sectionFor('Copper'), '.group-down')!.disabled).toBe(false)
      expect(buttonIn(sectionFor('Nuclear'), '.group-down')!.disabled).toBe(true)
    })

    // Ungrouped is synthesised rather than stored, so there is no record to give an order to.
    it('offers no arrows on Ungrouped', () => {
      open()

      expect(sectionFor('Ungrouped').querySelector('.group-up')).toBeNull()
      expect(sectionFor('Ungrouped').querySelector('.group-down')).toBeNull()
    })
  })

  describe('factory order', () => {
    it('moves a factory up within its own group', async () => {
      open()

      await fireEvent.click(buttonIn(rowFor('Copper Basics'), '.factory-up')!)

      expect(groupsApi.moveFactoryToGroup).toHaveBeenCalledWith(3, 'g1', 0)
    })

    it('moves it down within its own group', async () => {
      open()

      await fireEvent.click(buttonIn(rowFor('Copper Basics'), '.factory-down')!)

      expect(groupsApi.moveFactoryToGroup).toHaveBeenCalledWith(3, 'g1', 2)
    })

    it('has nothing to move past at either end of the group', () => {
      open()

      expect(buttonIn(rowFor('Copper Ingots'), '.factory-up')!.disabled).toBe(true)
      expect(buttonIn(rowFor('Copper Sheets'), '.factory-down')!.disabled).toBe(true)
    })

    it('files a factory under another group from the folder menu', async () => {
      open()

      await fireEvent.click(buttonIn(rowFor('Oil Processing'), '.factory-move-to')!)
      await nextTick()

      const items = [...body().querySelectorAll<HTMLElement>('.v-list-item')]
      await fireEvent.click(items.find(item => item.textContent?.includes('Nuclear'))!)

      expect(groupsApi.moveFactoryToGroup).toHaveBeenCalledWith(1, 'g2')
    })
  })

  describe('drag', () => {
    it('offers a group handle when there is a pointer precise enough to drag with', () => {
      open()

      expect(sectionFor('Copper').querySelector('.group-drag-handle')).not.toBeNull()
    })

    it('draws none where drag is off, since the buttons are the whole point of this dialog', async () => {
      dragEnabled.value = false
      open()
      await nextTick()

      expect(body().querySelector('.group-drag-handle')).toBeNull()
      expect(buttonIn(sectionFor('Copper'), '.group-down')).not.toBeUndefined()
    })
  })
})
