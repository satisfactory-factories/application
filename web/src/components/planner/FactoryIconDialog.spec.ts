import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { fireEvent } from '@testing-library/vue'
import FactoryIconDialog from './FactoryIconDialog.vue'
import { vuetifyRender } from '@/utils/ui-test-bootstrap'
import { newFactory } from '@/utils/factory-management/factory'
import eventBus from '@/utils/eventBus'

// v-dialog teleports to the document body, so everything is read from there.
const body = () => document.body
const tileFor = (name: string) => body().querySelector<HTMLElement>(`.icon-tile[title="${name}"]`)
const tabLabels = () => [...body().querySelectorAll('.v-tab')].map(tab => tab.textContent?.trim())

const openDialog = (factory = newFactory('Iron Ingots')) => {
  const rendered = vuetifyRender(FactoryIconDialog, {
    props: { factory, modelValue: true },
  })
  return { factory, ...rendered }
}

// Filtering is instant — no debounce to wait out.
const search = async (term: string) => {
  const input = body().querySelector<HTMLInputElement>('input[type="text"]')!
  await fireEvent.update(input, term)
  await nextTick()
}

describe('FactoryIconDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.spyOn(eventBus, 'emit')
  })

  it('opens on Buildings, with a tab per category and one for emoji', () => {
    openDialog()

    const tabs = tabLabels()
    expect(tabs[0]).toBe('Buildings')
    expect(tabs.at(-1)).toBe('Emoji')
    expect(tabs).toEqual(expect.arrayContaining([
      'Buildings', 'Power', 'Logistics', 'Vehicles', 'Raw Resources', 'Fluids', 'Components',
      'Equipment', 'Emoji',
    ]))
    expect(tabs).not.toContain('Popular')
    expect(tileFor('Smelter')).toBeTruthy()
  })

  it('sets the factory icon and closes when a tile is clicked', async () => {
    const { factory, emitted } = openDialog()

    await fireEvent.click(tileFor('Smelter')!)

    expect(factory.icon).toBe('smelter')
    expect(emitted()['update:modelValue']).toContainEqual([false])
  })

  it('tells the stores something changed so the plan saves and syncs', async () => {
    const { factory } = openDialog()

    await fireEvent.click(tileFor('Smelter')!)

    expect(eventBus.emit).toHaveBeenCalledWith('factoryUpdated', factory)
  })

  it('clears the icon on "Use default"', async () => {
    const factory = newFactory('Iron Ingots')
    factory.icon = 'smelter'
    openDialog(factory)

    const useDefault = [...body().querySelectorAll('button')]
      .find(button => button.textContent?.includes('Use default'))!
    await fireEvent.click(useDefault)

    expect(factory.icon).toBeUndefined()
    expect(eventBus.emit).toHaveBeenCalledWith('factoryUpdated', factory)
  })

  it('marks the current icon as selected', () => {
    const factory = newFactory('Iron Ingots')
    factory.icon = 'smelter'
    openDialog(factory)

    expect(tileFor('Smelter')?.classList.contains('selected')).toBe(true)
    expect(tileFor('Foundry')?.classList.contains('selected')).toBe(false)
  })

  describe('search', () => {
    it('hides the tabs while a query is active and restores them when cleared', async () => {
      openDialog()
      const tabsWhenIdle = tabLabels()

      await search('smelter')
      expect(tabLabels()).toEqual([])

      await search('')
      expect(tabLabels()).toEqual(tabsWhenIdle)
    })

    // No debounce: the grid filters on the keystroke, not 250ms later.
    it('filters immediately, without waiting on a timer', async () => {
      openDialog()

      await search('jetpack')

      expect(tileFor('Jetpack')).toBeTruthy()
      expect(tileFor('Smelter')).toBeNull()
    })

    // The point of a global search: the Emoji tab is not open, but its matches still show.
    it('searches game icons and emoji together, whatever tab is showing', async () => {
      openDialog()

      await search('red')

      expect(tileFor('Red square')).toBeTruthy()
      expect(tileFor('Red circle')).toBeTruthy()
    })

    it('finds emoji by their keywords, not just their names', async () => {
      openDialog()

      await search('nuclear')

      expect(tileFor('Radiation')).toBeTruthy()
    })

    it('finds game icons on tabs other than the open one', async () => {
      openDialog()

      expect(tileFor('Fabric')).toBeNull()
      await search('fabric')
      expect(tileFor('Fabric')).toBeTruthy()
    })

    it('reports when nothing matches', async () => {
      openDialog()

      await search('zzzzzzz')

      expect(body().textContent).toContain('No icons match your search.')
    })

    it('applies an icon straight from the results', async () => {
      const { factory } = openDialog()

      await search('fabric')
      await fireEvent.click(tileFor('Fabric')!)

      expect(factory.icon).toBe('fabric')
    })
  })
})
