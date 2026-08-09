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
const categoryLabels = () =>
  [...body().querySelectorAll('.category-chip')].map(chip => chip.textContent?.trim())
const activeCategory = () =>
  [...body().querySelectorAll('.category-chip')]
    .find(chip => chip.classList.contains('v-chip--variant-flat'))?.textContent?.trim()
const clickCategory = (label: string) =>
  fireEvent.click([...body().querySelectorAll('.category-chip')]
    .find(chip => chip.textContent?.trim() === label)!)

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

  it('opens on All, with the categories broken out after it', () => {
    openDialog()

    expect(categoryLabels()).toEqual([
      'All', 'Buildings', 'Power', 'Logistics', 'Vehicles', 'Raw Resources', 'Fluids',
      'Components', 'Equipment', 'Emoji',
    ])
    expect(activeCategory()).toBe('All')
    expect(categoryLabels()).not.toContain('Popular')
  })

  it('shows game art and emoji together on All', () => {
    openDialog()

    expect(tileFor('Smelter')).toBeTruthy()
    expect(tileFor('Conveyor Belt Mk.6')).toBeTruthy()
    expect(tileFor('Blue square')).toBeTruthy()
  })

  it('narrows to one category when its button is clicked', async () => {
    openDialog()

    await clickCategory('Equipment')

    expect(activeCategory()).toBe('Equipment')
    expect(tileFor('Jetpack')).toBeTruthy()
    expect(tileFor('Smelter')).toBeNull()
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
    it('keeps the category buttons visible, with none of them active', async () => {
      openDialog()
      const idle = categoryLabels()

      await search('smelter')

      expect(categoryLabels()).toEqual(idle)
      expect(activeCategory()).toBeUndefined()
    })

    it('restores the active category when the query is cleared', async () => {
      openDialog()
      await clickCategory('Equipment')

      await search('smelter')
      expect(activeCategory()).toBeUndefined()

      await search('')
      expect(activeCategory()).toBe('Equipment')
    })

    it('clicking a category is a way out of a search', async () => {
      openDialog()
      await search('smelter')

      await clickCategory('Vehicles')

      expect(activeCategory()).toBe('Vehicles')
      expect(tileFor('Drone')).toBeTruthy()
      expect(tileFor('Smelter')).toBeNull()
    })

    // No debounce: the grid filters on the keystroke, not 250ms later.
    it('filters immediately, without waiting on a timer', async () => {
      openDialog()

      await search('jetpack')

      expect(tileFor('Jetpack')).toBeTruthy()
      expect(tileFor('Smelter')).toBeNull()
    })

    // The point of searching the whole registry: narrowed to Buildings, a search still
    // surfaces emoji and components the open category does not contain.
    it('reaches past the selected category', async () => {
      openDialog()
      await clickCategory('Buildings')
      expect(tileFor('Fabric')).toBeNull()
      expect(tileFor('Red square')).toBeNull()

      await search('red')
      expect(tileFor('Red square')).toBeTruthy()
      expect(tileFor('Red circle')).toBeTruthy()

      await search('fabric')
      expect(tileFor('Fabric')).toBeTruthy()
    })

    it('finds emoji by their keywords, not just their names', async () => {
      openDialog()

      await search('nuclear')

      expect(tileFor('Radiation')).toBeTruthy()
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
